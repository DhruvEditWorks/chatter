package com.chatter.app;

import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.net.Uri;
import android.webkit.WebResourceRequest;
import android.webkit.WebView;
import android.webkit.WebViewClient;

/**
 * Keeps app navigation inside the WebView, opens real web links in the
 * browser, and injects the download bridge once the page has loaded.
 */
public class ChatterWebViewClient extends WebViewClient {

    /** Intercepts blob: downloads (contacts / replies / backup export) and
     *  routes them to the native ChatterBridge instead of a dead click. */
    private static final String DOWNLOAD_HOOK =
        "(function(){"
        + "if(window.__chatterDlHook)return;"
        + "window.__chatterDlHook=true;"
        + "var origClick=HTMLAnchorElement.prototype.click;"
        + "HTMLAnchorElement.prototype.click=function(){"
        + "try{"
        + "var href=this.getAttribute('href')||'';"
        + "if(href.indexOf('blob:')===0&&window.ChatterBridge"
        + "&&window.ChatterBridge.saveFile){"
        + "var name=this.getAttribute('download')||'download';"
        + "var xhr=new XMLHttpRequest();"
        + "xhr.open('GET',href,true);"
        + "xhr.responseType='blob';"
        + "xhr.onload=function(){"
        + "var reader=new FileReader();"
        + "reader.onloadend=function(){"
        + "var parts=String(reader.result||'').split(',');"
        + "var b64=parts.length>1?parts[1]:'';"
        + "window.ChatterBridge.saveFile(name,b64);"
        + "};"
        + "reader.readAsDataURL(xhr.response);"
        + "};"
        + "xhr.send();"
        + "return;"
        + "}"
        + "}catch(e){}"
        + "return origClick.apply(this,arguments);"
        + "};"
        + "})();";

    @Override
    public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
        return handleUrl(view, request.getUrl().toString());
    }

    @Override
    @SuppressWarnings("deprecation")
    public boolean shouldOverrideUrlLoading(WebView view, String url) {
        return handleUrl(view, url);
    }

    private boolean handleUrl(WebView view, String url) {
        if (url == null) {
            return false;
        }
        if (url.startsWith("file://") || url.startsWith("about:")
                || url.startsWith("data:")) {
            return false; // app content: load inside the WebView
        }
        try {
            view.getContext().startActivity(
                    new Intent(Intent.ACTION_VIEW, Uri.parse(url)));
        } catch (ActivityNotFoundException e) {
            return false;
        }
        return true;
    }

    @Override
    public void onPageFinished(WebView view, String url) {
        super.onPageFinished(view, url);
        view.evaluateJavascript(DOWNLOAD_HOOK, null);
    }
}
