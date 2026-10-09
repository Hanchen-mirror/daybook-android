param(
  [string]$Sdk = $env:ANDROID_HOME,
  [string]$JavaHome = $env:JAVA_HOME,
  [switch]$DebugBuild,
  [string]$KeyStore = '',
  [string]$KeyAlias = 'daybook'
)
$ErrorActionPreference = 'Stop'
if (-not $Sdk) { throw '请使用 -Sdk 指定包含 platforms 和 build-tools 的 Android SDK 目录。' }
if (-not $JavaHome) { throw '请设置 JAVA_HOME 或使用 -JavaHome 指定 JDK。' }
$env:JAVA_HOME = $JavaHome
$env:PATH = "$JavaHome\bin;$env:PATH"
$project = $PSScriptRoot
$build = Join-Path $project 'build'
$platform = Get-ChildItem (Join-Path $Sdk 'platforms') -Directory | Where-Object Name -Match '^android-\d+$' | Sort-Object { [int]($_.Name -replace 'android-','') } -Descending | Select-Object -First 1
$bt = Get-ChildItem (Join-Path $Sdk 'build-tools') -Directory | Where-Object Name -Match '^\d+\.\d+\.\d+$' | Sort-Object { [version]$_.Name } -Descending | Select-Object -First 1
if (-not $platform -or -not $bt) { throw 'SDK 中缺少 platform 或 build-tools。' }
$androidJar = Join-Path $platform.FullName 'android.jar'
New-Item -ItemType Directory -Force -Path $build,(Join-Path $build 'classes'),(Join-Path $build 'dex'),(Join-Path $build 'generated') | Out-Null
function Invoke-Checked([string]$Tool, [string[]]$ToolArgs) { & $Tool @ToolArgs; if ($LASTEXITCODE -ne 0) { throw "执行失败：$Tool，退出码 $LASTEXITCODE" } }
$manifest = Get-Content (Join-Path $project 'AndroidManifest.xml') -Raw -Encoding UTF8
if ($DebugBuild) { $manifest = $manifest.Replace('android:debuggable="false"','android:debuggable="true"') }
[IO.File]::WriteAllText((Join-Path $build 'AndroidManifest.xml'),$manifest,[Text.UTF8Encoding]::new($false))
Invoke-Checked (Join-Path $bt.FullName 'aapt2.exe') @('compile','--dir',(Join-Path $project 'res'),'-o',(Join-Path $build 'resources.zip'))
Invoke-Checked (Join-Path $bt.FullName 'aapt2.exe') @('link','-o',(Join-Path $build 'unsigned.apk'),'--manifest',(Join-Path $build 'AndroidManifest.xml'),'-I',$androidJar,'--java',(Join-Path $build 'generated'),'-A',(Join-Path $project 'assets'),(Join-Path $build 'resources.zip'))
$sources = @(Get-ChildItem (Join-Path $project 'src'),(Join-Path $build 'generated') -Recurse -Filter '*.java' | ForEach-Object FullName)
Invoke-Checked (Join-Path $JavaHome 'bin\javac.exe') (@('-encoding','UTF-8','-source','8','-target','8','-classpath',$androidJar,'-d',(Join-Path $build 'classes')) + $sources)
Invoke-Checked (Join-Path $JavaHome 'bin\jar.exe') @('cf',(Join-Path $build 'classes.jar'),'-C',(Join-Path $build 'classes'),'.')
Invoke-Checked (Join-Path $bt.FullName 'd8.bat') @('--release','--min-api','26','--lib',$androidJar,'--output',(Join-Path $build 'dex'),(Join-Path $build 'classes.jar'))
Add-Type -AssemblyName System.IO.Compression.FileSystem
$zip=[IO.Compression.ZipFile]::Open((Join-Path $build 'unsigned.apk'),[IO.Compression.ZipArchiveMode]::Update)
try { [IO.Compression.ZipFileExtensions]::CreateEntryFromFile($zip,(Join-Path $build 'dex\classes.dex'),'classes.dex') | Out-Null } finally { $zip.Dispose() }
Invoke-Checked (Join-Path $bt.FullName 'zipalign.exe') @('-f','4',(Join-Path $build 'unsigned.apk'),(Join-Path $build 'aligned.apk'))
if (-not $KeyStore) {
  $KeyStore=Join-Path $project 'signing\daybook-local.p12'
  New-Item -ItemType Directory -Force (Split-Path $KeyStore) | Out-Null
  if (-not $env:DAYBOOK_KEY_PASSWORD) {
    $passwordFile=Join-Path $project 'signing\password.txt'
    if (Test-Path -LiteralPath $passwordFile) { $env:DAYBOOK_KEY_PASSWORD=[IO.File]::ReadAllText($passwordFile) }
    else { $bytes=New-Object byte[] 24; $rng=[Security.Cryptography.RandomNumberGenerator]::Create(); $rng.GetBytes($bytes); $rng.Dispose(); $env:DAYBOOK_KEY_PASSWORD=[Convert]::ToBase64String($bytes); [IO.File]::WriteAllText($passwordFile,$env:DAYBOOK_KEY_PASSWORD) }
  }
  if (-not (Test-Path -LiteralPath $KeyStore)) { Invoke-Checked (Join-Path $JavaHome 'bin\keytool.exe') @('-genkeypair','-keystore',$KeyStore,'-storepass:env','DAYBOOK_KEY_PASSWORD','-keypass:env','DAYBOOK_KEY_PASSWORD','-alias',$KeyAlias,'-keyalg','RSA','-keysize','3072','-validity','10000','-dname','CN=Daybook Local, O=Personal, C=CN','-storetype','PKCS12') }
}
if (-not $env:DAYBOOK_KEY_PASSWORD) { throw '自定义签名密钥需要设置 DAYBOOK_KEY_PASSWORD 环境变量。' }
$version = ([xml]$manifest).manifest.GetAttribute('versionName','http://schemas.android.com/apk/res/android')
if ($version -notmatch '^\d+\.\d+\.\d+$') { throw 'Manifest 的版本号无效。' }
$name=if ($DebugBuild) { 'daybook-qa.apk' } else { "daybook-$version.apk" }
Invoke-Checked (Join-Path $bt.FullName 'apksigner.bat') @('sign','--ks',$KeyStore,'--ks-key-alias',$KeyAlias,'--ks-pass','env:DAYBOOK_KEY_PASSWORD','--key-pass','env:DAYBOOK_KEY_PASSWORD','--out',(Join-Path $build $name),(Join-Path $build 'aligned.apk'))
Invoke-Checked (Join-Path $bt.FullName 'apksigner.bat') @('verify','--verbose',(Join-Path $build $name))
Write-Output "APK: $(Join-Path $build $name)"
