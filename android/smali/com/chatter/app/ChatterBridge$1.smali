.class Lcom/chatter/app/ChatterBridge$1;
.super Ljava/lang/Object;
.source "ChatterBridge.java"
.implements Ljava/lang/Runnable;

# Anonymous Runnable for the save-confirmation toast (see ChatterBridge.toast).

.field this$0:Lcom/chatter/app/ChatterBridge;

.field private val$text:Ljava/lang/String;


.method constructor <init>(Lcom/chatter/app/ChatterBridge;Ljava/lang/String;)V
    .locals 0
    invoke-direct {p0}, Ljava/lang/Object;-><init>()V
    iput-object p1, p0, Lcom/chatter/app/ChatterBridge$1;->this$0:Lcom/chatter/app/ChatterBridge;
    iput-object p2, p0, Lcom/chatter/app/ChatterBridge$1;->val$text:Ljava/lang/String;
    return-void
.end method


.method public run()V
    .locals 3

    iget-object v0, p0, Lcom/chatter/app/ChatterBridge$1;->this$0:Lcom/chatter/app/ChatterBridge;
    iget-object v0, v0, Lcom/chatter/app/ChatterBridge;->activity:Lcom/chatter/app/MainActivity;
    iget-object v1, p0, Lcom/chatter/app/ChatterBridge$1;->val$text:Ljava/lang/String;
    const/4 v2, 0x1
    invoke-static {v0, v1, v2}, Landroid/widget/Toast;->makeText(Landroid/content/Context;Ljava/lang/CharSequence;I)Landroid/widget/Toast;
    move-result-object v2
    invoke-virtual {v2}, Landroid/widget/Toast;->show()V
    return-void
.end method
