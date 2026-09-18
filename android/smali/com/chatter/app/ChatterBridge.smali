.class public Lcom/chatter/app/ChatterBridge;
.super Ljava/lang/Object;
.source "ChatterBridge.java"

# Mirrors android/app/src/main/java/com/chatter/app/ChatterBridge.java.
# NOTE: the activity field is package-visible (instead of private + synthetic
# accessor like javac would emit) so ChatterBridge$1 can read it directly.
# Behavior is identical.

.field activity:Lcom/chatter/app/MainActivity;


.method constructor <init>(Lcom/chatter/app/MainActivity;)V
    .locals 0
    invoke-direct {p0}, Ljava/lang/Object;-><init>()V
    iput-object p1, p0, Lcom/chatter/app/ChatterBridge;->activity:Lcom/chatter/app/MainActivity;
    return-void
.end method


.method public saveFile(Ljava/lang/String;Ljava/lang/String;)V
    .annotation runtime Landroid/webkit/JavascriptInterface;
    .end annotation
    .locals 5

    if-eqz p1, :cond_default

    const-string v0, "[^A-Za-z0-9._-]+"
    const-string v1, "_"
    invoke-virtual {p1, v0, v1}, Ljava/lang/String;->replaceAll(Ljava/lang/String;Ljava/lang/String;)Ljava/lang/String;
    move-result-object v0
    invoke-virtual {v0}, Ljava/lang/String;->isEmpty()Z
    move-result v1
    if-eqz v1, :cond_have_name

    :cond_default
    const-string v0, "download"

    :cond_have_name
    :try_save
    const/4 v1, 0x0
    invoke-static {p2, v1}, Landroid/util/Base64;->decode(Ljava/lang/String;I)[B
    move-result-object v1

    sget v2, Landroid/os/Build$VERSION;->SDK_INT:I
    const/16 v3, 0x1d
    iget-object v4, p0, Lcom/chatter/app/ChatterBridge;->activity:Lcom/chatter/app/MainActivity;
    if-lt v2, v3, :cond_legacy
    invoke-static {v4, v0, v1}, Lcom/chatter/app/ChatterBridge;->saveWithMediaStore(Landroid/content/Context;Ljava/lang/String;[B)V
    goto :cond_saved

    :cond_legacy
    invoke-static {v4, v0, v1}, Lcom/chatter/app/ChatterBridge;->saveToExternalFiles(Landroid/content/Context;Ljava/lang/String;[B)V

    :cond_saved
    new-instance v1, Ljava/lang/StringBuilder;
    invoke-direct {v1}, Ljava/lang/StringBuilder;-><init>()V
    const-string v2, "Saved "
    invoke-virtual {v1, v2}, Ljava/lang/StringBuilder;->append(Ljava/lang/String;)Ljava/lang/StringBuilder;
    move-result-object v2
    invoke-virtual {v1, v0}, Ljava/lang/StringBuilder;->append(Ljava/lang/String;)Ljava/lang/StringBuilder;
    move-result-object v2
    const-string v2, " to Downloads"
    invoke-virtual {v1, v2}, Ljava/lang/StringBuilder;->append(Ljava/lang/String;)Ljava/lang/StringBuilder;
    move-result-object v2
    invoke-virtual {v1}, Ljava/lang/StringBuilder;->toString()Ljava/lang/String;
    move-result-object v1
    invoke-direct {p0, v1}, Lcom/chatter/app/ChatterBridge;->toast(Ljava/lang/String;)V
    :try_save_end
    .catch Ljava/lang/Exception; {:try_save .. :try_save_end} :catch_failed
    return-void

    :catch_failed
    move-exception v1
    new-instance v2, Ljava/lang/StringBuilder;
    invoke-direct {v2}, Ljava/lang/StringBuilder;-><init>()V
    const-string v3, "Could not save "
    invoke-virtual {v2, v3}, Ljava/lang/StringBuilder;->append(Ljava/lang/String;)Ljava/lang/StringBuilder;
    move-result-object v3
    invoke-virtual {v2, v0}, Ljava/lang/StringBuilder;->append(Ljava/lang/String;)Ljava/lang/StringBuilder;
    move-result-object v3
    invoke-virtual {v2}, Ljava/lang/StringBuilder;->toString()Ljava/lang/String;
    move-result-object v2
    invoke-direct {p0, v2}, Lcom/chatter/app/ChatterBridge;->toast(Ljava/lang/String;)V
    return-void
.end method


.method private static saveWithMediaStore(Landroid/content/Context;Ljava/lang/String;[B)V
    .locals 6

    new-instance v0, Landroid/content/ContentValues;
    invoke-direct {v0}, Landroid/content/ContentValues;-><init>()V
    const-string v1, "_display_name"
    invoke-virtual {v0, v1, p1}, Landroid/content/ContentValues;->put(Ljava/lang/String;Ljava/lang/String;)V
    const-string v1, "mime_type"
    invoke-static {p1}, Lcom/chatter/app/ChatterBridge;->guessMimeType(Ljava/lang/String;)Ljava/lang/String;
    move-result-object v5
    invoke-virtual {v0, v1, v5}, Landroid/content/ContentValues;->put(Ljava/lang/String;Ljava/lang/String;)V
    const-string v1, "is_pending"
    const/4 v5, 0x1
    invoke-static {v5}, Ljava/lang/Integer;->valueOf(I)Ljava/lang/Integer;
    move-result-object v5
    invoke-virtual {v0, v1, v5}, Landroid/content/ContentValues;->put(Ljava/lang/String;Ljava/lang/Integer;)V

    invoke-virtual {p0}, Landroid/content/Context;->getContentResolver()Landroid/content/ContentResolver;
    move-result-object v1
    sget-object v2, Landroid/provider/MediaStore$Downloads;->EXTERNAL_CONTENT_URI:Landroid/net/Uri;
    invoke-virtual {v1, v2, v0}, Landroid/content/ContentResolver;->insert(Landroid/net/Uri;Landroid/content/ContentValues;)Landroid/net/Uri;
    move-result-object v2
    if-eqz v2, :cond_uri_ok
    new-instance v0, Ljava/lang/IllegalStateException;
    const-string v1, "MediaStore insert failed"
    invoke-direct {v0, v1}, Ljava/lang/IllegalStateException;-><init>(Ljava/lang/String;)V
    throw v0

    :cond_uri_ok
    invoke-virtual {v1, v2}, Landroid/content/ContentResolver;->openOutputStream(Landroid/net/Uri;)Ljava/io/OutputStream;
    move-result-object v3
    if-eqz v3, :cond_out_ok
    new-instance v0, Ljava/lang/IllegalStateException;
    const-string v1, "MediaStore open failed"
    invoke-direct {v0, v1}, Ljava/lang/IllegalStateException;-><init>(Ljava/lang/String;)V
    throw v0

    :cond_out_ok
    :try_write
    invoke-virtual {v3, p2}, Ljava/io/OutputStream;->write([B)V
    invoke-virtual {v3}, Ljava/io/OutputStream;->close()V
    :try_write_end
    .catchall {:try_write .. :try_write_end} :catch_write
    goto :cond_update

    :catch_write
    move-exception v0
    invoke-static {v3}, Lcom/chatter/app/ChatterBridge;->closeQuietly(Ljava/io/Closeable;)V
    throw v0

    :cond_update
    new-instance v4, Landroid/content/ContentValues;
    invoke-direct {v4}, Landroid/content/ContentValues;-><init>()V
    const-string v0, "is_pending"
    const/4 v5, 0x0
    invoke-static {v5}, Ljava/lang/Integer;->valueOf(I)Ljava/lang/Integer;
    move-result-object v5
    invoke-virtual {v4, v0, v5}, Landroid/content/ContentValues;->put(Ljava/lang/String;Ljava/lang/Integer;)V
    const/4 v0, 0x0
    const/4 v5, 0x0
    invoke-virtual {v1, v2, v4, v0, v5}, Landroid/content/ContentResolver;->update(Landroid/net/Uri;Landroid/content/ContentValues;Ljava/lang/String;[Ljava/lang/String;)I
    move-result v0
    return-void
.end method


.method private static saveToExternalFiles(Landroid/content/Context;Ljava/lang/String;[B)V
    .locals 4

    const-string v0, "Download"
    invoke-virtual {p0, v0}, Landroid/content/Context;->getExternalFilesDir(Ljava/lang/String;)Ljava/io/File;
    move-result-object v0
    if-eqz v0, :cond_have_dir
    invoke-virtual {v0}, Ljava/io/File;->exists()Z
    move-result v3
    if-nez v3, :cond_have_dir
    invoke-virtual {v0}, Ljava/io/File;->mkdirs()Z
    move-result v3
    if-nez v3, :cond_have_dir
    new-instance v1, Ljava/lang/IllegalStateException;
    const-string v2, "Cannot create Downloads dir"
    invoke-direct {v1, v2}, Ljava/lang/IllegalStateException;-><init>(Ljava/lang/String;)V
    throw v1

    :cond_have_dir
    new-instance v1, Ljava/io/File;
    invoke-direct {v1, v0, p1}, Ljava/io/File;-><init>(Ljava/io/File;Ljava/lang/String;)V
    new-instance v2, Ljava/io/FileOutputStream;
    invoke-direct {v2, v1}, Ljava/io/FileOutputStream;-><init>(Ljava/io/File;)V
    :try_write
    invoke-virtual {v2, p2}, Ljava/io/OutputStream;->write([B)V
    invoke-virtual {v2}, Ljava/io/OutputStream;->close()V
    :try_write_end
    .catchall {:try_write .. :try_write_end} :catch_write
    return-void

    :catch_write
    move-exception v0
    invoke-static {v2}, Lcom/chatter/app/ChatterBridge;->closeQuietly(Ljava/io/Closeable;)V
    throw v0
.end method


.method private static closeQuietly(Ljava/io/Closeable;)V
    .locals 1

    if-eqz p0, :cond_done
    :try_close
    invoke-interface {p0}, Ljava/io/Closeable;->close()V
    :try_close_end
    .catch Ljava/lang/Exception; {:try_close .. :try_close_end} :catch_ignored
    return-void

    :catch_ignored
    move-exception v0

    :cond_done
    return-void
.end method


.method private static guessMimeType(Ljava/lang/String;)Ljava/lang/String;
    .locals 2

    invoke-virtual {p0}, Ljava/lang/String;->toLowerCase()Ljava/lang/String;
    move-result-object v0
    const-string v1, ".json"
    invoke-virtual {v0, v1}, Ljava/lang/String;->endsWith(Ljava/lang/String;)Z
    move-result v1
    if-nez v1, :cond_json
    const-string v1, ".ctrjs"
    invoke-virtual {v0, v1}, Ljava/lang/String;->endsWith(Ljava/lang/String;)Z
    move-result v1
    if-nez v1, :cond_json
    const-string v1, ".txt"
    invoke-virtual {v0, v1}, Ljava/lang/String;->endsWith(Ljava/lang/String;)Z
    move-result v1
    if-nez v1, :cond_txt
    const-string v0, "application/octet-stream"
    return-object v0

    :cond_json
    const-string v0, "application/json"
    return-object v0

    :cond_txt
    const-string v0, "text/plain"
    return-object v0
.end method


.method private toast(Ljava/lang/String;)V
    .locals 2

    iget-object v1, p0, Lcom/chatter/app/ChatterBridge;->activity:Lcom/chatter/app/MainActivity;
    new-instance v0, Lcom/chatter/app/ChatterBridge$1;
    invoke-direct {v0, p0, p1}, Lcom/chatter/app/ChatterBridge$1;-><init>(Lcom/chatter/app/ChatterBridge;Ljava/lang/String;)V
    invoke-virtual {v1, v0}, Lcom/chatter/app/MainActivity;->runOnUiThread(Ljava/lang/Runnable;)V
    return-void
.end method
