#!/usr/bin/env python3
"""Cross-check every Android framework member used by the app's Java sources
against a platform android.jar (default: API 34 from Sable/android-platforms).

Parses the CONSTANT_Utf8 pool of each referenced .class stub and asserts the
method/field names + descriptors we rely on exist. This catches typos and
wrong signatures without needing javac.

Usage: python3 tools/check_android_api.py [path/to/android.jar]
"""

import struct
import sys
import zipfile

# (class file, member name, descriptor or None for "any")
#   method descriptors use JNI syntax, e.g. (Z)V ; fields e.g. I
CHECKS = [
    # android/app/Activity
    ("android/app/Activity.class", "onCreate", "(Landroid/os/Bundle;)V"),
    ("android/app/Activity.class", "setContentView", "(Landroid/view/View;)V"),
    ("android/app/Activity.class", "onActivityResult", "(IILandroid/content/Intent;)V"),
    ("android/app/Activity.class", "onSaveInstanceState", "(Landroid/os/Bundle;)V"),
    ("android/app/Activity.class", "onBackPressed", "()V"),
    ("android/app/Activity.class", "onPause", "()V"),
    ("android/app/Activity.class", "onResume", "()V"),
    ("android/app/Activity.class", "onDestroy", "()V"),
    ("android/app/Activity.class", "runOnUiThread", "(Ljava/lang/Runnable;)V"),
    ("android/app/Activity.class", "startActivityForResult", "(Landroid/content/Intent;I)V"),
    # android/content/Context
    ("android/content/Context.class", "getString", "(I)Ljava/lang/String;"),
    ("android/content/Context.class", "getContentResolver", "()Landroid/content/ContentResolver;"),
    ("android/content/Context.class", "getExternalFilesDir", "(Ljava/lang/String;)Ljava/io/File;"),
    ("android/content/Context.class", "startActivity", "(Landroid/content/Intent;)V"),
    ("android/app/Activity.class", "RESULT_OK", "I"),
    # android/webkit/WebView
    ("android/webkit/WebView.class", "<init>", "(Landroid/content/Context;)V"),
    ("android/webkit/WebView.class", "getSettings", "()Landroid/webkit/WebSettings;"),
    ("android/webkit/WebView.class", "setWebViewClient", "(Landroid/webkit/WebViewClient;)V"),
    ("android/webkit/WebView.class", "setWebChromeClient", "(Landroid/webkit/WebChromeClient;)V"),
    ("android/webkit/WebView.class", "addJavascriptInterface", "(Ljava/lang/Object;Ljava/lang/String;)V"),
    ("android/webkit/WebView.class", "loadUrl", "(Ljava/lang/String;)V"),
    ("android/webkit/WebView.class", "restoreState", "(Landroid/os/Bundle;)Landroid/webkit/WebBackForwardList;"),
    ("android/webkit/WebView.class", "saveState", "(Landroid/os/Bundle;)Landroid/webkit/WebBackForwardList;"),
    ("android/webkit/WebView.class", "canGoBack", "()Z"),
    ("android/webkit/WebView.class", "goBack", "()V"),
    ("android/webkit/WebView.class", "onPause", "()V"),
    ("android/webkit/WebView.class", "onResume", "()V"),
    ("android/webkit/WebView.class", "destroy", "()V"),
    ("android/webkit/WebView.class", "evaluateJavascript", "(Ljava/lang/String;Landroid/webkit/ValueCallback;)V"),
    # android/view/View
    ("android/view/View.class", "requestFocus", "()Z"),
    ("android/view/ViewGroup.class", "removeAllViews", "()V"),
    ("android/view/View.class", "getContext", "()Landroid/content/Context;"),
    # android/webkit/WebSettings
    ("android/webkit/WebSettings.class", "setJavaScriptEnabled", "(Z)V"),
    ("android/webkit/WebSettings.class", "setDomStorageEnabled", "(Z)V"),
    ("android/webkit/WebSettings.class", "setDatabaseEnabled", "(Z)V"),
    ("android/webkit/WebSettings.class", "setAllowFileAccess", "(Z)V"),
    ("android/webkit/WebSettings.class", "setAllowFileAccessFromFileURLs", "(Z)V"),
    ("android/webkit/WebSettings.class", "setAllowUniversalAccessFromFileURLs", "(Z)V"),
    ("android/webkit/WebSettings.class", "setAllowContentAccess", "(Z)V"),
    ("android/webkit/WebSettings.class", "setMediaPlaybackRequiresUserGesture", "(Z)V"),
    ("android/webkit/WebSettings.class", "setLoadWithOverviewMode", "(Z)V"),
    ("android/webkit/WebSettings.class", "setUseWideViewPort", "(Z)V"),
    ("android/webkit/WebSettings.class", "setBuiltInZoomControls", "(Z)V"),
    ("android/webkit/WebSettings.class", "setDisplayZoomControls", "(Z)V"),
    ("android/webkit/WebSettings.class", "setTextZoom", "(I)V"),
    ("android/webkit/WebSettings.class", "setCacheMode", "(I)V"),
    ("android/webkit/WebSettings.class", "setMixedContentMode", "(I)V"),
    ("android/webkit/WebSettings.class", "LOAD_DEFAULT", "I"),
    ("android/webkit/WebSettings.class", "MIXED_CONTENT_ALWAYS_ALLOW", "I"),
    # android/webkit/WebViewClient + WebResourceRequest
    ("android/webkit/WebViewClient.class", "shouldOverrideUrlLoading",
     "(Landroid/webkit/WebView;Landroid/webkit/WebResourceRequest;)Z"),
    ("android/webkit/WebViewClient.class", "shouldOverrideUrlLoading",
     "(Landroid/webkit/WebView;Ljava/lang/String;)Z"),
    ("android/webkit/WebViewClient.class", "onPageFinished",
     "(Landroid/webkit/WebView;Ljava/lang/String;)V"),
    ("android/webkit/WebResourceRequest.class", "getUrl", "()Landroid/net/Uri;"),
    # android/webkit/WebChromeClient + FileChooserParams
    ("android/webkit/WebChromeClient.class", "onShowFileChooser",
     "(Landroid/webkit/WebView;Landroid/webkit/ValueCallback;Landroid/webkit/WebChromeClient$FileChooserParams;)Z"),
    ("android/webkit/WebChromeClient.class", "onConsoleMessage",
     "(Landroid/webkit/ConsoleMessage;)Z"),
    ("android/webkit/WebChromeClient$FileChooserParams.class", "getAcceptTypes", "()[Ljava/lang/String;"),
    ("android/webkit/WebChromeClient$FileChooserParams.class", "getMode", "()I"),
    ("android/webkit/WebChromeClient$FileChooserParams.class", "MODE_OPEN_MULTIPLE", "I"),
    ("android/webkit/ValueCallback.class", "onReceiveValue", "(Ljava/lang/Object;)V"),
    ("android/webkit/ConsoleMessage.class", "sourceId", "()Ljava/lang/String;"),
    ("android/webkit/ConsoleMessage.class", "lineNumber", "()I"),
    ("android/webkit/ConsoleMessage.class", "message", "()Ljava/lang/String;"),
    ("android/webkit/JavascriptInterface.class", None, None),  # annotation exists
    # android/content/Intent
    ("android/content/Intent.class", "getClipData", "()Landroid/content/ClipData;"),
    ("android/content/Intent.class", "getData", "()Landroid/net/Uri;"),
    ("android/content/Intent.class", "setType", "(Ljava/lang/String;)Landroid/content/Intent;"),
    ("android/content/Intent.class", "putExtra", "(Ljava/lang/String;[Ljava/lang/String;)Landroid/content/Intent;"),
    ("android/content/Intent.class", "putExtra", "(Ljava/lang/String;Z)Landroid/content/Intent;"),
    ("android/content/Intent.class", "addCategory", "(Ljava/lang/String;)Landroid/content/Intent;"),
    ("android/content/Intent.class", "createChooser",
     "(Landroid/content/Intent;Ljava/lang/CharSequence;)Landroid/content/Intent;"),
    ("android/content/Intent.class", "ACTION_VIEW", "Ljava/lang/String;"),
    ("android/content/Intent.class", "ACTION_GET_CONTENT", "Ljava/lang/String;"),
    ("android/content/Intent.class", "CATEGORY_OPENABLE", "Ljava/lang/String;"),
    ("android/content/Intent.class", "EXTRA_MIME_TYPES", "Ljava/lang/String;"),
    ("android/content/Intent.class", "EXTRA_ALLOW_MULTIPLE", "Ljava/lang/String;"),
    ("android/content/Intent.class", "<init>", "(Ljava/lang/String;)V"),
    ("android/content/Intent.class", "<init>", "(Ljava/lang/String;Landroid/net/Uri;)V"),
    ("android/content/ContentValues.class", "<init>", "()V"),
    # android/content/ClipData
    ("android/content/ClipData.class", "getItemCount", "()I"),
    ("android/content/ClipData.class", "getItemAt", "(I)Landroid/content/ClipData$Item;"),
    ("android/content/ClipData$Item.class", "getUri", "()Landroid/net/Uri;"),
    # android/net/Uri
    ("android/net/Uri.class", "parse", "(Ljava/lang/String;)Landroid/net/Uri;"),
    ("android/net/Uri.class", "toString", "()Ljava/lang/String;"),
    # android/util/Log + Base64
    ("android/util/Log.class", "d", "(Ljava/lang/String;Ljava/lang/String;)I"),
    ("android/util/Base64.class", "decode", "(Ljava/lang/String;I)[B"),
    ("android/util/Base64.class", "DEFAULT", "I"),
    # android/os/Build
    ("android/os/Build$VERSION.class", "SDK_INT", "I"),
    ("android/os/Build$VERSION_CODES.class", "Q", "I"),
    # android/provider/MediaStore.Downloads (API 29+)
    ("android/provider/MediaStore$Downloads.class", "EXTERNAL_CONTENT_URI", "Landroid/net/Uri;"),
    ("android/provider/MediaStore$MediaColumns.class", "DISPLAY_NAME", "Ljava/lang/String;"),
    ("android/provider/MediaStore$MediaColumns.class", "MIME_TYPE", "Ljava/lang/String;"),
    ("android/provider/MediaStore$MediaColumns.class", "IS_PENDING", "Ljava/lang/String;"),
    # android/content/ContentResolver + ContentValues
    ("android/content/ContentResolver.class", "insert",
     "(Landroid/net/Uri;Landroid/content/ContentValues;)Landroid/net/Uri;"),
    ("android/content/ContentResolver.class", "update",
     "(Landroid/net/Uri;Landroid/content/ContentValues;Ljava/lang/String;[Ljava/lang/String;)I"),
    ("android/content/ContentResolver.class", "openOutputStream",
     "(Landroid/net/Uri;)Ljava/io/OutputStream;"),
    ("android/content/ContentValues.class", "put",
     "(Ljava/lang/String;Ljava/lang/String;)V"),
    ("android/content/ContentValues.class", "put",
     "(Ljava/lang/String;Ljava/lang/Integer;)V"),
    ("android/content/ContentValues.class", "clear", "()V"),
    # android/os/Environment
    ("android/os/Environment.class", "DIRECTORY_DOWNLOADS", "Ljava/lang/String;"),
    # android/widget/Toast
    ("android/widget/Toast.class", "makeText",
     "(Landroid/content/Context;Ljava/lang/CharSequence;I)Landroid/widget/Toast;"),
    ("android/widget/Toast.class", "show", "()V"),
    ("android/widget/Toast.class", "LENGTH_LONG", "I"),
]


def utf8_pool(class_bytes):
    """Extract all CONSTANT_Utf8 strings from a .class file."""
    if class_bytes[:4] != b"\xca\xfe\xba\xbe":
        raise ValueError("bad class magic")
    pos = 8
    count = struct.unpack(">H", class_bytes[pos:pos + 2])[0]
    pos += 2
    out = []
    i = 1
    while i < count:
        tag = class_bytes[pos]
        pos += 1
        if tag == 1:  # Utf8
            ln = struct.unpack(">H", class_bytes[pos:pos + 2])[0]
            pos += 2
            out.append(class_bytes[pos:pos + ln].decode("utf-8", "replace"))
            pos += ln
        elif tag in (3, 4):
            pos += 4
        elif tag in (5, 6):
            pos += 8
            i += 1  # long/double take two slots
        elif tag in (7, 8, 16, 19, 20):
            pos += 2
        elif tag in (9, 10, 11, 12, 17, 18):
            pos += 4
        elif tag == 15:
            pos += 3
        else:
            raise ValueError("unknown constant tag %d" % tag)
        i += 1
    return out


def main():
    jar_path = sys.argv[1] if len(sys.argv) > 1 else "/tmp/sable/android-34/android.jar"
    try:
        jar = zipfile.ZipFile(jar_path)
    except Exception as e:
        print("check_android_api: cannot open %s: %s" % (jar_path, e))
        sys.exit(2)
    names = set(jar.namelist())
    pools = {}
    failures = 0
    for cls, member, desc in CHECKS:
        if cls not in names:
            print("MISSING CLASS: %s" % cls)
            failures += 1
            continue
        if member is None:
            continue  # existence-only check
        if cls not in pools:
            pools[cls] = utf8_pool(jar.read(cls))
        pool = pools[cls]
        if member not in pool:
            print("MISSING MEMBER: %s :: %s" % (cls, member))
            failures += 1
        elif desc is not None and desc not in pool:
            print("MISSING DESCRIPTOR: %s :: %s %s" % (cls, member, desc))
            failures += 1
    print("check_android_api: %d checks, %d failures (%s)"
          % (len(CHECKS), failures, jar_path))
    sys.exit(1 if failures else 0)


if __name__ == "__main__":
    main()
