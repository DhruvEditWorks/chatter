.class public Lcom/chatter/app/MainActivity;
.super Landroid/app/Activity;
.source "MainActivity.java"

# Mirrors android/app/src/main/java/com/chatter/app/MainActivity.java.
# Built with the smali assembler (see tools/build_apk.py).

.field static final FILE_CHOOSER_REQUEST:I = 0x3e9

.field filePathCallback:Landroid/webkit/ValueCallback;

.field private webView:Landroid/webkit/WebView;


.method public constructor <init>()V
    .locals 0
    invoke-direct {p0}, Landroid/app/Activity;-><init>()V
    return-void
.end method


.method protected onCreate(Landroid/os/Bundle;)V
    .locals 2

    invoke-super {p0, p1}, Landroid/app/Activity;->onCreate(Landroid/os/Bundle;)V

    new-instance v0, Landroid/webkit/WebView;
    invoke-direct {v0, p0}, Landroid/webkit/WebView;-><init>(Landroid/content/Context;)V
    iput-object v0, p0, Lcom/chatter/app/MainActivity;->webView:Landroid/webkit/WebView;

    invoke-direct {p0, v0}, Lcom/chatter/app/MainActivity;->configureWebView(Landroid/webkit/WebView;)V

    if-eqz p1, :cond_fresh

    iget-object v0, p0, Lcom/chatter/app/MainActivity;->webView:Landroid/webkit/WebView;
    invoke-virtual {v0, p1}, Landroid/webkit/WebView;->restoreState(Landroid/os/Bundle;)Landroid/webkit/WebBackForwardList;
    move-result-object v1
    goto :cond_content

    :cond_fresh
    iget-object v0, p0, Lcom/chatter/app/MainActivity;->webView:Landroid/webkit/WebView;
    const-string v1, "file:///android_asset/www/index.html"
    invoke-virtual {v0, v1}, Landroid/webkit/WebView;->loadUrl(Ljava/lang/String;)V

    :cond_content
    iget-object v0, p0, Lcom/chatter/app/MainActivity;->webView:Landroid/webkit/WebView;
    invoke-virtual {p0, v0}, Landroid/app/Activity;->setContentView(Landroid/view/View;)V

    iget-object v0, p0, Lcom/chatter/app/MainActivity;->webView:Landroid/webkit/WebView;
    invoke-virtual {v0}, Landroid/webkit/WebView;->requestFocus()Z
    move-result v1

    return-void
.end method


.method private configureWebView(Landroid/webkit/WebView;)V
    .locals 2

    invoke-virtual {p1}, Landroid/webkit/WebView;->getSettings()Landroid/webkit/WebSettings;
    move-result-object v0

    const/4 v1, 0x1
    invoke-virtual {v0, v1}, Landroid/webkit/WebSettings;->setJavaScriptEnabled(Z)V
    invoke-virtual {v0, v1}, Landroid/webkit/WebSettings;->setDomStorageEnabled(Z)V
    invoke-virtual {v0, v1}, Landroid/webkit/WebSettings;->setDatabaseEnabled(Z)V
    invoke-virtual {v0, v1}, Landroid/webkit/WebSettings;->setAllowFileAccess(Z)V
    invoke-virtual {v0, v1}, Landroid/webkit/WebSettings;->setAllowFileAccessFromFileURLs(Z)V
    invoke-virtual {v0, v1}, Landroid/webkit/WebSettings;->setAllowUniversalAccessFromFileURLs(Z)V
    invoke-virtual {v0, v1}, Landroid/webkit/WebSettings;->setAllowContentAccess(Z)V
    invoke-virtual {v0, v1}, Landroid/webkit/WebSettings;->setLoadWithOverviewMode(Z)V
    invoke-virtual {v0, v1}, Landroid/webkit/WebSettings;->setUseWideViewPort(Z)V

    const/4 v1, 0x0
    invoke-virtual {v0, v1}, Landroid/webkit/WebSettings;->setMediaPlaybackRequiresUserGesture(Z)V
    invoke-virtual {v0, v1}, Landroid/webkit/WebSettings;->setBuiltInZoomControls(Z)V
    invoke-virtual {v0, v1}, Landroid/webkit/WebSettings;->setDisplayZoomControls(Z)V

    const/16 v1, 0x64
    invoke-virtual {v0, v1}, Landroid/webkit/WebSettings;->setTextZoom(I)V

    const/4 v1, -0x1
    invoke-virtual {v0, v1}, Landroid/webkit/WebSettings;->setCacheMode(I)V

    const/4 v1, 0x0
    invoke-virtual {v0, v1}, Landroid/webkit/WebSettings;->setMixedContentMode(I)V

    new-instance v1, Lcom/chatter/app/ChatterWebViewClient;
    invoke-direct {v1}, Lcom/chatter/app/ChatterWebViewClient;-><init>()V
    invoke-virtual {p1, v1}, Landroid/webkit/WebView;->setWebViewClient(Landroid/webkit/WebViewClient;)V

    new-instance v1, Lcom/chatter/app/ChatterWebChromeClient;
    invoke-direct {v1, p0}, Lcom/chatter/app/ChatterWebChromeClient;-><init>(Lcom/chatter/app/MainActivity;)V
    invoke-virtual {p1, v1}, Landroid/webkit/WebView;->setWebChromeClient(Landroid/webkit/WebChromeClient;)V

    new-instance v1, Lcom/chatter/app/ChatterBridge;
    invoke-direct {v1, p0}, Lcom/chatter/app/ChatterBridge;-><init>(Lcom/chatter/app/MainActivity;)V
    const-string v0, "ChatterBridge"
    invoke-virtual {p1, v1, v0}, Landroid/webkit/WebView;->addJavascriptInterface(Ljava/lang/Object;Ljava/lang/String;)V

    return-void
.end method


.method protected onActivityResult(IILandroid/content/Intent;)V
    .locals 5

    invoke-super {p0, p1, p2, p3}, Landroid/app/Activity;->onActivityResult(IILandroid/content/Intent;)V

    const/16 v0, 0x3e9
    if-ne p1, v0, :cond_done

    iget-object v0, p0, Lcom/chatter/app/MainActivity;->filePathCallback:Landroid/webkit/ValueCallback;
    if-eqz v0, :cond_done

    const/4 v0, 0x0

    const/4 v1, -0x1
    if-ne p2, v1, :cond_deliver
    if-eqz p3, :cond_deliver

    invoke-virtual {p3}, Landroid/content/Intent;->getClipData()Landroid/content/ClipData;
    move-result-object v1
    if-eqz v1, :cond_single

    invoke-virtual {v1}, Landroid/content/ClipData;->getItemCount()I
    move-result v2
    new-array v0, v2, [Landroid/net/Uri;
    const/4 v3, 0x0

    :loop_items
    if-ge v3, v2, :cond_deliver
    invoke-virtual {v1, v3}, Landroid/content/ClipData;->getItemAt(I)Landroid/content/ClipData$Item;
    move-result-object v4
    invoke-virtual {v4}, Landroid/content/ClipData$Item;->getUri()Landroid/net/Uri;
    move-result-object v4
    aput-object v4, v0, v3
    add-int/lit8 v3, v3, 0x1
    goto :loop_items

    :cond_single
    invoke-virtual {p3}, Landroid/content/Intent;->getData()Landroid/net/Uri;
    move-result-object v1
    if-eqz v1, :cond_deliver
    const/4 v2, 0x1
    new-array v0, v2, [Landroid/net/Uri;
    const/4 v2, 0x0
    aput-object v1, v0, v2

    :cond_deliver
    iget-object v1, p0, Lcom/chatter/app/MainActivity;->filePathCallback:Landroid/webkit/ValueCallback;
    invoke-interface {v1, v0}, Landroid/webkit/ValueCallback;->onReceiveValue(Ljava/lang/Object;)V
    const/4 v1, 0x0
    iput-object v1, p0, Lcom/chatter/app/MainActivity;->filePathCallback:Landroid/webkit/ValueCallback;

    :cond_done
    return-void
.end method


.method protected onSaveInstanceState(Landroid/os/Bundle;)V
    .locals 2

    invoke-super {p0, p1}, Landroid/app/Activity;->onSaveInstanceState(Landroid/os/Bundle;)V

    iget-object v0, p0, Lcom/chatter/app/MainActivity;->webView:Landroid/webkit/WebView;
    if-eqz v0, :cond_done
    invoke-virtual {v0, p1}, Landroid/webkit/WebView;->saveState(Landroid/os/Bundle;)Landroid/webkit/WebBackForwardList;
    move-result-object v1

    :cond_done
    return-void
.end method


.method public onBackPressed()V
    .locals 1

    iget-object v0, p0, Lcom/chatter/app/MainActivity;->webView:Landroid/webkit/WebView;
    if-eqz v0, :cond_super
    invoke-virtual {v0}, Landroid/webkit/WebView;->canGoBack()Z
    move-result v0
    if-eqz v0, :cond_super

    iget-object v0, p0, Lcom/chatter/app/MainActivity;->webView:Landroid/webkit/WebView;
    invoke-virtual {v0}, Landroid/webkit/WebView;->goBack()V
    return-void

    :cond_super
    invoke-super {p0}, Landroid/app/Activity;->onBackPressed()V
    return-void
.end method


.method protected onPause()V
    .locals 1

    invoke-super {p0}, Landroid/app/Activity;->onPause()V

    iget-object v0, p0, Lcom/chatter/app/MainActivity;->webView:Landroid/webkit/WebView;
    if-eqz v0, :cond_done
    invoke-virtual {v0}, Landroid/webkit/WebView;->onPause()V

    :cond_done
    return-void
.end method


.method protected onResume()V
    .locals 1

    invoke-super {p0}, Landroid/app/Activity;->onResume()V

    iget-object v0, p0, Lcom/chatter/app/MainActivity;->webView:Landroid/webkit/WebView;
    if-eqz v0, :cond_done
    invoke-virtual {v0}, Landroid/webkit/WebView;->onResume()V

    :cond_done
    return-void
.end method


.method protected onDestroy()V
    .locals 1

    iget-object v0, p0, Lcom/chatter/app/MainActivity;->webView:Landroid/webkit/WebView;
    if-eqz v0, :cond_super
    invoke-virtual {v0}, Landroid/webkit/WebView;->removeAllViews()V
    invoke-virtual {v0}, Landroid/webkit/WebView;->destroy()V
    const/4 v0, 0x0
    iput-object v0, p0, Lcom/chatter/app/MainActivity;->webView:Landroid/webkit/WebView;

    :cond_super
    invoke-super {p0}, Landroid/app/Activity;->onDestroy()V
    return-void
.end method
