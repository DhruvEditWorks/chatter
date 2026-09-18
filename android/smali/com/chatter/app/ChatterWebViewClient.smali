.class public Lcom/chatter/app/ChatterWebViewClient;
.super Landroid/webkit/WebViewClient;
.source "ChatterWebViewClient.java"

# Mirrors android/app/src/main/java/com/chatter/app/ChatterWebViewClient.java.


.method public constructor <init>()V
    .locals 0
    invoke-direct {p0}, Landroid/webkit/WebViewClient;-><init>()V
    return-void
.end method


.method public shouldOverrideUrlLoading(Landroid/webkit/WebView;Landroid/webkit/WebResourceRequest;)Z
    .locals 2

    invoke-virtual {p2}, Landroid/webkit/WebResourceRequest;->getUrl()Landroid/net/Uri;
    move-result-object v0
    invoke-virtual {v0}, Landroid/net/Uri;->toString()Ljava/lang/String;
    move-result-object v1
    invoke-direct {p0, p1, v1}, Lcom/chatter/app/ChatterWebViewClient;->handleUrl(Landroid/webkit/WebView;Ljava/lang/String;)Z
    move-result v0
    return v0
.end method


.method public shouldOverrideUrlLoading(Landroid/webkit/WebView;Ljava/lang/String;)Z
    .locals 1

    invoke-direct {p0, p1, p2}, Lcom/chatter/app/ChatterWebViewClient;->handleUrl(Landroid/webkit/WebView;Ljava/lang/String;)Z
    move-result v0
    return v0
.end method


.method private handleUrl(Landroid/webkit/WebView;Ljava/lang/String;)Z
    .locals 3

    if-eqz p2, :cond_allow

    const-string v0, "file://"
    invoke-virtual {p2, v0}, Ljava/lang/String;->startsWith(Ljava/lang/String;)Z
    move-result v0
    if-eqz v0, :cond_allow

    const-string v0, "about:"
    invoke-virtual {p2, v0}, Ljava/lang/String;->startsWith(Ljava/lang/String;)Z
    move-result v0
    if-eqz v0, :cond_allow

    const-string v0, "data:"
    invoke-virtual {p2, v0}, Ljava/lang/String;->startsWith(Ljava/lang/String;)Z
    move-result v0
    if-eqz v0, :cond_allow

    # External link: open in the browser.
    :try_open
    new-instance v1, Landroid/content/Intent;
    const-string v0, "android.intent.action.VIEW"
    invoke-static {p2}, Landroid/net/Uri;->parse(Ljava/lang/String;)Landroid/net/Uri;
    move-result-object v2
    invoke-direct {v1, v0, v2}, Landroid/content/Intent;-><init>(Ljava/lang/String;Landroid/net/Uri;)V
    invoke-virtual {p1}, Landroid/webkit/WebView;->getContext()Landroid/content/Context;
    move-result-object v0
    invoke-virtual {v0, v1}, Landroid/content/Context;->startActivity(Landroid/content/Intent;)V
    :try_open_end
    .catch Landroid/content/ActivityNotFoundException; {:try_open .. :try_open_end} :catch_notfound

    const/4 v0, 0x1
    return v0

    :catch_notfound
    move-exception v0

    :cond_allow
    const/4 v0, 0x0
    return v0
.end method


.method public onPageFinished(Landroid/webkit/WebView;Ljava/lang/String;)V
    .locals 2

    invoke-super {p0, p1, p2}, Landroid/webkit/WebViewClient;->onPageFinished(Landroid/webkit/WebView;Ljava/lang/String;)V

    # Download bridge: route blob: export clicks to ChatterBridge.saveFile.
    const-string v0, "(function(){if(window.__chatterDlHook)return;window.__chatterDlHook=true;var origClick=HTMLAnchorElement.prototype.click;HTMLAnchorElement.prototype.click=function(){try{var href=this.getAttribute('href')||'';if(href.indexOf('blob:')===0&&window.ChatterBridge&&window.ChatterBridge.saveFile){var name=this.getAttribute('download')||'download';var xhr=new XMLHttpRequest();xhr.open('GET',href,true);xhr.responseType='blob';xhr.onload=function(){var reader=new FileReader();reader.onloadend=function(){var parts=String(reader.result||'').split(',');var b64=parts.length>1?parts[1]:'';window.ChatterBridge.saveFile(name,b64);};reader.readAsDataURL(xhr.response);};xhr.send();return;}}catch(e){}return origClick.apply(this,arguments);};})();"
    const/4 v1, 0x0
    invoke-virtual {p1, v0, v1}, Landroid/webkit/WebView;->evaluateJavascript(Ljava/lang/String;Landroid/webkit/ValueCallback;)V

    return-void
.end method
