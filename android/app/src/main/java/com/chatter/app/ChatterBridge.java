package com.chatter.app;

import android.content.ContentResolver;
import android.content.ContentValues;
import android.content.Context;
import android.net.Uri;
import android.os.Build;
import android.os.Environment;
import android.provider.MediaStore;
import android.util.Base64;
import android.webkit.JavascriptInterface;
import android.widget.Toast;

import java.io.File;
import java.io.FileOutputStream;
import java.io.OutputStream;

/**
 * JavaScript bridge (exposed as {@code window.ChatterBridge}).
 *
 * The web app exports files (backup .ctrjs, contacts.json,
 * upcoming_replies.txt) through blob: download links, which do nothing in a
 * WebView on their own. The injected download hook forwards those exports
 * here as base64, and we save them where the user can find them:
 * the Downloads collection on Android 10+, the app's external Downloads
 * folder on older versions. No storage permission required either way.
 */
public class ChatterBridge {

    private final MainActivity activity;

    ChatterBridge(MainActivity activity) {
        this.activity = activity;
    }

    @JavascriptInterface
    public void saveFile(String filename, String base64Data) {
        String safe = filename == null ? "download" :
                filename.replaceAll("[^A-Za-z0-9._-]+", "_");
        if (safe.isEmpty()) {
            safe = "download";
        }
        try {
            byte[] data = Base64.decode(base64Data, Base64.DEFAULT);
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                saveWithMediaStore(activity, safe, data);
            } else {
                saveToExternalFiles(activity, safe, data);
            }
            toast("Saved " + safe + " to Downloads");
        } catch (Exception e) {
            toast("Could not save " + safe);
        }
    }

    private static void saveWithMediaStore(Context context, String name,
                                           byte[] data) throws Exception {
        ContentValues values = new ContentValues();
        values.put(MediaStore.Downloads.DISPLAY_NAME, name);
        values.put(MediaStore.Downloads.MIME_TYPE, guessMimeType(name));
        values.put(MediaStore.Downloads.IS_PENDING, 1);
        ContentResolver resolver = context.getContentResolver();
        Uri uri = resolver.insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI,
                values);
        if (uri == null) {
            throw new IllegalStateException("MediaStore insert failed");
        }
        OutputStream out = resolver.openOutputStream(uri);
        if (out == null) {
            throw new IllegalStateException("MediaStore open failed");
        }
        try {
            out.write(data);
        } finally {
            out.close();
        }
        ContentValues done = new ContentValues();
        done.put(MediaStore.Downloads.IS_PENDING, 0);
        resolver.update(uri, done, null, null);
    }

    private static void saveToExternalFiles(Context context, String name,
                                            byte[] data) throws Exception {
        File dir = context.getExternalFilesDir(Environment.DIRECTORY_DOWNLOADS);
        if (dir != null && !dir.exists() && !dir.mkdirs()) {
            throw new IllegalStateException("Cannot create Downloads dir");
        }
        File out = new File(dir, name);
        FileOutputStream fos = new FileOutputStream(out);
        try {
            fos.write(data);
        } finally {
            fos.close();
        }
    }

    private static String guessMimeType(String name) {
        String lower = name.toLowerCase();
        if (lower.endsWith(".json") || lower.endsWith(".ctrjs")) {
            return "application/json";
        }
        if (lower.endsWith(".txt")) {
            return "text/plain";
        }
        return "application/octet-stream";
    }

    private void toast(final String text) {
        activity.runOnUiThread(new Runnable() {
            @Override
            public void run() {
                Toast.makeText(activity, text, Toast.LENGTH_LONG).show();
            }
        });
    }
}
