package cn.local.daybook;

import android.content.*;
import android.database.Cursor;
import android.database.sqlite.*;
import org.json.*;
import java.text.SimpleDateFormat;
import java.util.*;

public final class LedgerDb extends SQLiteOpenHelper {
    public LedgerDb(Context context) { super(context, "daybook.db", null, 1); }
    public void onCreate(SQLiteDatabase db) {
        db.execSQL("CREATE TABLE entries (id TEXT PRIMARY KEY, type TEXT NOT NULL CHECK(type IN ('expense','income')), cents INTEGER NOT NULL CHECK(cents>0 AND cents<=99999999999), date TEXT NOT NULL, category TEXT NOT NULL, note TEXT NOT NULL, createdAt TEXT NOT NULL)");
        db.execSQL("CREATE INDEX entries_date ON entries(date)");
    }
    public void onUpgrade(SQLiteDatabase db, int oldVersion, int newVersion) { throw new IllegalStateException("不支持的数据库版本"); }
    public static JSONObject validate(JSONObject e) throws Exception {
        String id = e.getString("id"), type = e.getString("type"), date = e.getString("date");
        if (!id.matches("[a-zA-Z0-9_-]{1,80}")) throw new Exception("账单编号无效");
        if (!type.equals("income") && !type.equals("expense")) throw new Exception("收支类型无效");
        Object raw = e.get("cents");
        if (!(raw instanceof Number) || !raw.toString().matches("[0-9]+")) throw new Exception("金额必须是整数分");
        long cents = e.getLong("cents");
        if (cents < 1 || cents > 99999999999L) throw new Exception("金额须在 0.01 至 999,999,999.99 元之间");
        SimpleDateFormat f = new SimpleDateFormat("yyyy-MM-dd", Locale.ROOT); f.setLenient(false);
        if (!date.matches("[0-9]{4}-[0-9]{2}-[0-9]{2}") || date.compareTo("1900-01-01") < 0 || !f.format(f.parse(date)).equals(date)) throw new Exception("日期无效");
        String category = e.getString("category").trim(), note = e.optString("note", "");
        if (category.length() < 1 || category.length() > 30 || note.length() > 200) throw new Exception("分类或备注长度不符合要求");
        String created = e.optString("createdAt", "");
        if (created.length() > 40) throw new Exception("创建时间格式无效");
        return new JSONObject().put("id", id).put("type", type).put("cents", cents).put("date", date).put("category", category).put("note", note).put("createdAt", created);
    }
    private ContentValues values(JSONObject e) throws Exception {
        ContentValues v = new ContentValues();
        for (String key : new String[]{"id", "type", "date", "category", "note", "createdAt"}) v.put(key, e.getString(key));
        v.put("cents", e.getLong("cents")); return v;
    }
    public synchronized JSONArray all() throws Exception {
        JSONArray rows = new JSONArray();
        try (Cursor c = getReadableDatabase().rawQuery("SELECT * FROM entries ORDER BY date DESC, createdAt DESC, id DESC", null)) {
            while(c.moveToNext()) {
                JSONObject e = new JSONObject();
                for (String k : new String[]{"id", "type", "date", "category", "note", "createdAt"}) e.put(k,c.getString(c.getColumnIndexOrThrow(k)));
                e.put("cents",c.getLong(c.getColumnIndexOrThrow("cents"))); rows.put(e);
            }
        }
        return rows;
    }
    public synchronized void save(String data) throws Exception {
        JSONObject e = validate(new JSONObject(data));
        if (getWritableDatabase().insertWithOnConflict("entries", null, values(e), SQLiteDatabase.CONFLICT_REPLACE) == -1) throw new Exception("保存失败，请检查可用存储空间");
    }
    public synchronized void delete(String id) { getWritableDatabase().delete("entries", "id=?", new String[]{id}); }
    public static JSONArray parseBackup(String content) throws Exception {
        JSONObject root = new JSONObject(content);
        if (!root.getString("app").equals("daybook") || root.getInt("schemaVersion") != 1 || !root.getString("currency").equals("CNY")) throw new Exception("请选择日常账本导出的 JSON 备份（版本 1 / CNY）");
        JSONArray rows = root.getJSONArray("entries");
        if(rows.length() > 50000) throw new Exception("单次最多导入 50,000 条账单");
        JSONArray valid = new JSONArray(); HashSet<String> ids = new HashSet<>();
        for(int i=0;i<rows.length();i++) {
            JSONObject e = validate(rows.getJSONObject(i));
            if(!ids.add(e.getString("id"))) throw new Exception("备份包含重复编号，未导入任何数据");
            valid.put(e);
        }
        return valid;
    }
    public synchronized int merge(JSONArray rows) throws Exception {
        SQLiteDatabase db = getWritableDatabase(); int added = 0; db.beginTransaction();
        try {
            for(int i=0;i<rows.length();i++) if(db.insertWithOnConflict("entries", null, values(rows.getJSONObject(i)), SQLiteDatabase.CONFLICT_IGNORE) != -1) added++;
            db.setTransactionSuccessful();
        } finally { db.endTransaction(); }
        return added;
    }
}
