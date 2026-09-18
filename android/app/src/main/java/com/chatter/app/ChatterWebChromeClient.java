package com.chatter.app;

import android.content.Intent;
import android.net.Uri;
import android.util.Log;
import android.webkit.ConsoleMessage;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebView;

/**
 * Provides the file chooser used by the app's import features
 * (avatar photo, .ctrjs backup, contacts.json, upcoming_replies.txt)
 * and mirrors the page console to logcat for debugging.
 */
public class ChatterWebChromeClient extends WebChromeClient {

    private static final String TAG = "Chatter";

    private final MainActivity activity;

    ChatterWebChromeClient(MainActivity activity) {
        this.activity = activity;
    }

    @Override
    public boolean onShowFileChooser(WebView webView,
                                     ValueCallback<Uri[]> filePathCallback,
                                     FileChooserParams fileChooserParams) {
        if (activity.filePathCallback != null) {
            activity.filePathCallback.onReceiveValue(null);
        }
        activity.filePathCallback = filePathCallback;

        Intent intent = new Intent(Intent.ACTION_GET_CONTENT);
        intent.addCategory(Intent.CATEGORY_OPENABLE);

        String[] acceptTypes = fileChooserParams.getAcceptTypes();
        if (acceptTypes != null && acceptTypes.length > 0
                && acceptTypes[0] != null && !acceptTypes[0].isEmpty()) {
            if (acceptTypes.length == 1) {
                intent.setType(acceptTypes[0]);
            } else {
                intent.setType("*/*");
                intent.putExtra(Intent.EXTRA_MIME_TYPES, acceptTypes);
            }
        } else {
            intent.setType("*/*");
        }
        if (fileChooserParams.getMode() == FileChooserParams.MODE_OPEN_MULTIPLE) {
            intent.putExtra(Intent.EXTRA_ALLOW_MULTIPLE, true);
        }

        activity.startActivityForResult(
                Intent.createChooser(intent,
                        activity.getString(R.string.file_chooser_title)),
                MainActivity.FILE_CHOOSER_REQUEST);
        return true;
    }

    @Override
    public boolean onConsoleMessage(ConsoleMessage consoleMessage) {
        Log.d(TAG, consoleMessage.sourceId() + ":" + consoleMessage.lineNumber()
                + " " + consoleMessage.message());
        return true;
    }
}
