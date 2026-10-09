package cn.local.daybook;

import android.app.*;
import android.os.*;
import android.content.*;
import android.content.pm.ApplicationInfo;
import android.graphics.Color;
import android.webkit.*;
import android.view.*;
import java.io.*;
import java.nio.charset.StandardCharsets;
import java.util.concurrent.*;
import org.json.*;

public class MainActivity extends Activity {
    private WebView web; private LedgerDb db;
    private String pendingExport;
    private final ExecutorService io = Executors.newSingleThreadExecutor();
    private static final String ORIGIN = "https://app.daybook.local/";
    public void onCreate(Bundle state) {
        super.onCreate(state); db = new LedgerDb(this);
        getWindow().setStatusBarColor(Color.rgb(246,248,252)); getWindow().setNavigationBarColor(Color.WHITE);
        getWindow().getDecorView().setSystemUiVisibility(View.SYSTEM_UI_FLAG_LIGHT_STATUS_BAR | View.SYSTEM_UI_FLAG_LIGHT_NAVIGATION_BAR);
        web = new WebView(this); web.setBackgroundColor(Color.rgb(246,248,252));
        web.setOnApplyWindowInsetsListener((view, insets) -> {
            view.setPadding(insets.getSystemWindowInsetLeft(), insets.getSystemWindowInsetTop(), insets.getSystemWindowInsetRight(), insets.getSystemWindowInsetBottom());
            return insets.consumeSystemWindowInsets();
        });
        WebSettings s = web.getSettings(); s.setJavaScriptEnabled(true); s.setDomStorageEnabled(false);
        s.setAllowFileAccess(false); s.setAllowContentAccess(false); s.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        WebView.setWebContentsDebuggingEnabled((getApplicationInfo().flags & ApplicationInfo.FLAG_DEBUGGABLE) != 0);
        web.setWebViewClient(new WebViewClient() {
            public boolean shouldOverrideUrlLoading(WebView v, WebResourceRequest request) { return true; }
            public WebResourceResponse shouldInterceptRequest(WebView v, WebResourceRequest request) {
                String url = request.getUrl().toString();
                String name = url.startsWith(ORIGIN) ? url.substring(ORIGIN.length()) : "";
                if(name.isEmpty()) name = "index.html";
                try {
                    if(!url.startsWith(ORIGIN) || !name.matches("(index\\.html|app\\.css|app\\.js|ledger\\.js)")) throw new IOException();
                    String mime = name.endsWith("css") ? "text/css" : name.endsWith("js") ? "application/javascript" : "text/html";
                    return new WebResourceResponse(mime,"UTF-8",getAssets().open(name));
                } catch(IOException e) { return new WebResourceResponse("text/plain","UTF-8",new ByteArrayInputStream(new byte[0])); }
            }
        });
        web.addJavascriptInterface(new Bridge(), "Native"); setContentView(web); web.loadUrl(ORIGIN + "index.html");
    }
    private String result(boolean ok, Object value) {
        try { return new JSONObject().put("ok",ok).put(ok?"data":"error",value).toString(); } catch(Exception e) { return "{\"ok\":false,\"error\":\"操作失败\"}"; }
    }
    private void message(String msg, boolean refresh) {
        runOnUiThread(() -> { if(!isFinishing()) web.evaluateJavascript("window.nativeDone(" + JSONObject.quote(msg) + "," + refresh + ")",null); });
    }
    public class Bridge {
        @JavascriptInterface public String list() { try { return result(true, db.all()); } catch(Exception e) { return result(false,"读取账单失败"); } }
        @JavascriptInterface public String save(String data) { try { db.save(data); return result(true,"已保存"); } catch(Exception e) { return result(false,e.getMessage()); } }
        @JavascriptInterface public String remove(String id) { try { db.delete(id); return result(true,"已删除"); } catch(Exception e) { return result(false,"删除失败"); } }
        @JavascriptInterface public void exportFile(String format, String content) {
            if(!format.matches("json|csv|html") || content.length() > 20000000) { message("导出内容过大或格式无效",false); return; }
            runOnUiThread(() -> {
                if(pendingExport != null) { message("请先完成当前导出",false); return; }
                pendingExport = content;
                Intent i = new Intent(Intent.ACTION_CREATE_DOCUMENT); i.addCategory(Intent.CATEGORY_OPENABLE);
                i.setType(format.equals("json") ? "application/json" : format.equals("csv") ? "text/csv" : "text/html");
                i.putExtra(Intent.EXTRA_TITLE,"日常账本-" + new java.text.SimpleDateFormat("yyyyMMdd-HHmmss",java.util.Locale.ROOT).format(new java.util.Date()) + "." + format);
                try { startActivityForResult(i,10); } catch(Exception e) { pendingExport=null; message("系统未提供文件保存器",false); }
            });
        }
        @JavascriptInterface public void importFile() {
            runOnUiThread(() -> { Intent i = new Intent(Intent.ACTION_OPEN_DOCUMENT); i.addCategory(Intent.CATEGORY_OPENABLE); i.setType("*/*");
                try { startActivityForResult(i,11); } catch(Exception e) { message("系统未提供文件选择器",false); }
            });
        }
    }
    protected void onActivityResult(int req, int code, Intent data) {
        super.onActivityResult(req,code,data);
        if(req==10) {
            String text = pendingExport; pendingExport=null;
            if(code!=RESULT_OK || data==null || text==null) { message("已取消导出",false); return; }
            io.execute(() -> {
                try(OutputStream out = getContentResolver().openOutputStream(data.getData(),"wt")) {
                    if(out==null) throw new IOException(); out.write(text.getBytes(StandardCharsets.UTF_8)); out.flush(); message("文件已导出",false);
                } catch(Exception e) { message("导出失败，请检查保存位置和空间",false); }
            });
        }
        if(req==11 && code==RESULT_OK && data!=null) io.execute(() -> {
            try(InputStream in = getContentResolver().openInputStream(data.getData()); ByteArrayOutputStream out = new ByteArrayOutputStream()) {
                if(in==null) throw new IOException(); byte[] buffer = new byte[8192]; int size;
                while((size=in.read(buffer))!=-1) { out.write(buffer,0,size); if(out.size()>20000000) throw new Exception("备份文件不能超过 20 MB"); }
                String text = new String(out.toByteArray(),StandardCharsets.UTF_8); if(text.startsWith("\uFEFF")) text=text.substring(1);
                JSONArray rows = LedgerDb.parseBackup(text);
                runOnUiThread(() -> { if(!isFinishing()) new AlertDialog.Builder(this).setTitle("导入 " + rows.length() + " 条账单？").setMessage("合并到本地账本。相同编号会跳过，已有账单不会被覆盖。").setNegativeButton("取消",null).setPositiveButton("合并导入",(d,w)->io.execute(() -> {
                    try { int added=db.merge(rows); message("已导入 " + added + " 条，跳过 " + (rows.length()-added) + " 条重复账单",true); } catch(Exception e) { message("导入失败，未修改账本",false); }
                })).show(); });
            } catch(Exception e) { message("无法导入：" + (e.getMessage()==null?"文件无法读取":e.getMessage()),false); }
        });
    }
    public void onBackPressed() { web.evaluateJavascript("window.handleBack()",value -> { if("false".equals(value)) super.onBackPressed(); }); }
    protected void onResume() { super.onResume(); if(web!=null) web.evaluateJavascript("window.onAppResume && window.onAppResume()",null); }
    protected void onDestroy() { if(web!=null) { web.removeJavascriptInterface("Native"); web.destroy(); } io.shutdown(); super.onDestroy(); }
}
