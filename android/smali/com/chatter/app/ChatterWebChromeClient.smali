.class public Lcom/chatter/app/ChatterWebChromeClient;
.super Landroid/webkit/WebChromeClient;
.source "ChatterWebChromeClient.java"

# Mirrors android/app/src/main/java/com/chatter/app/ChatterWebChromeClient.java.
# NOTE: R.string.file_chooser_title below is filled in by tools/build_apk.py
# from the aapt2-generated R.java (resource IDs are assigned at link time).

.field private activity:Lcom/chatter/app/MainActivity;


.method constructor <init>(Lcom/chatter/app/MainActivity;)V
    .locals 0
    invoke-direct {p0}, Landroid/webkit/WebChromeClient;-><init>()V
    iput-object p1, p0, Lcom/chatter/app/ChatterWebChromeClient;->activity:Lcom/chatter/app/MainActivity;
    return-void
.end method


.method public onShowFileChooser(Landroid/webkit/WebView;Landroid/webkit/ValueCallback;Landroid/webkit/WebChromeClient$FileChooserParams;)Z
    .locals 5

    iget-object v0, p0, Lcom/chatter/app/ChatterWebChromeClient;->activity:Lcom/chatter/app/MainActivity;

    iget-object v1, v0, Lcom/chatter/app/MainActivity;->filePathCallback:Landroid/webkit/ValueCallback;
    if-eqz v1, :cond_store
    const/4 v4, 0x0
    invoke-interface {v1, v4}, Landroid/webkit/ValueCallback;->onReceiveValue(Ljava/lang/Object;)V

    :cond_store
    iput-object p2, v0, Lcom/chatter/app/MainActivity;->filePathCallback:Landroid/webkit/ValueCallback;

    new-instance v2, Landroid/content/Intent;
    const-string v1, "android.intent.action.GET_CONTENT"
    invoke-direct {v2, v1}, Landroid/content/Intent;-><init>(Ljava/lang/String;)V
    const-string v1, "android.intent.category.OPENABLE"
    invoke-virtual {v2, v1}, Landroid/content/Intent;->addCategory(Ljava/lang/String;)Landroid/content/Intent;
    move-result-object v4

    invoke-virtual {p3}, Landroid/webkit/WebChromeClient$FileChooserParams;->getAcceptTypes()[Ljava/lang/String;
    move-result-object v3
    if-eqz v3, :cond_any
    array-length v1, v3
    if-eqz v1, :cond_any
    const/4 v4, 0x0
    aget-object v1, v3, v4
    if-eqz v1, :cond_any
    invoke-virtual {v1}, Ljava/lang/String;->isEmpty()Z
    move-result v4
    if-nez v4, :cond_any

    array-length v4, v3
    const/4 v1, 0x1
    if-ne v4, v1, :cond_multi
    const/4 v4, 0x0
    aget-object v1, v3, v4
    invoke-virtual {v2, v1}, Landroid/content/Intent;->setType(Ljava/lang/String;)Landroid/content/Intent;
    move-result-object v4
    goto :cond_mode

    :cond_multi
    const-string v1, "*/*"
    invoke-virtual {v2, v1}, Landroid/content/Intent;->setType(Ljava/lang/String;)Landroid/content/Intent;
    move-result-object v4
    const-string v1, "android.intent.extra.MIME_TYPES"
    invoke-virtual {v2, v1, v3}, Landroid/content/Intent;->putExtra(Ljava/lang/String;[Ljava/lang/String;)Landroid/content/Intent;
    move-result-object v4
    goto :cond_mode

    :cond_any
    const-string v1, "*/*"
    invoke-virtual {v2, v1}, Landroid/content/Intent;->setType(Ljava/lang/String;)Landroid/content/Intent;
    move-result-object v4

    :cond_mode
    invoke-virtual {p3}, Landroid/webkit/WebChromeClient$FileChooserParams;->getMode()I
    move-result v1
    const/4 v4, 0x1
    if-ne v1, v4, :cond_launch
    const-string v1, "android.intent.extra.ALLOW_MULTIPLE"
    const/4 v4, 0x1
    invoke-virtual {v2, v1, v4}, Landroid/content/Intent;->putExtra(Ljava/lang/String;Z)Landroid/content/Intent;
    move-result-object v3

    :cond_launch
    const v1, 0x7f000000
    invoke-virtual {v0, v1}, Lcom/chatter/app/MainActivity;->getString(I)Ljava/lang/String;
    move-result-object v1
    invoke-static {v2, v1}, Landroid/content/Intent;->createChooser(Landroid/content/Intent;Ljava/lang/CharSequence;)Landroid/content/Intent;
    move-result-object v1
    const/16 v3, 0x3e9
    invoke-virtual {v0, v1, v3}, Lcom/chatter/app/MainActivity;->startActivityForResult(Landroid/content/Intent;I)V

    const/4 v0, 0x1
    return v0
.end method


.method public onConsoleMessage(Landroid/webkit/ConsoleMessage;)Z
    .locals 3

    new-instance v0, Ljava/lang/StringBuilder;
    invoke-direct {v0}, Ljava/lang/StringBuilder;-><init>()V
    invoke-virtual {p1}, Landroid/webkit/ConsoleMessage;->sourceId()Ljava/lang/String;
    move-result-object v1
    invoke-virtual {v0, v1}, Ljava/lang/StringBuilder;->append(Ljava/lang/String;)Ljava/lang/StringBuilder;
    move-result-object v1
    const-string v1, ":"
    invoke-virtual {v0, v1}, Ljava/lang/StringBuilder;->append(Ljava/lang/String;)Ljava/lang/StringBuilder;
    move-result-object v1
    invoke-virtual {p1}, Landroid/webkit/ConsoleMessage;->lineNumber()I
    move-result v2
    invoke-virtual {v0, v2}, Ljava/lang/StringBuilder;->append(I)Ljava/lang/StringBuilder;
    move-result-object v1
    const-string v1, " "
    invoke-virtual {v0, v1}, Ljava/lang/StringBuilder;->append(Ljava/lang/String;)Ljava/lang/StringBuilder;
    move-result-object v1
    invoke-virtual {p1}, Landroid/webkit/ConsoleMessage;->message()Ljava/lang/String;
    move-result-object v1
    invoke-virtual {v0, v1}, Ljava/lang/StringBuilder;->append(Ljava/lang/String;)Ljava/lang/StringBuilder;
    move-result-object v1
    invoke-virtual {v0}, Ljava/lang/StringBuilder;->toString()Ljava/lang/String;
    move-result-object v0
    const-string v1, "Chatter"
    invoke-static {v1, v0}, Landroid/util/Log;->d(Ljava/lang/String;Ljava/lang/String;)I
    move-result v1

    const/4 v0, 0x1
    return v0
.end method
