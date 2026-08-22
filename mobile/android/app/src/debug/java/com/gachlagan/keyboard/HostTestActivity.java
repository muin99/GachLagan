package com.gachlagan.keyboard;
import android.app.Activity;
import android.content.ClipData;
import android.content.ClipboardManager;
import android.os.Bundle;
import android.widget.Button;
import android.widget.EditText;
import android.widget.LinearLayout;
import android.widget.TextView;
/** Debug-only external-editor stand-in. Never included in release artifacts. */
public final class HostTestActivity extends Activity {
  @Override public void onCreate(Bundle state) {
    super.onCreate(state);
    LinearLayout root = new LinearLayout(this); root.setOrientation(LinearLayout.VERTICAL); root.setPadding(20, 40, 20, 8);
    TextView title = new TextView(this); title.setText("Keyboard test host · DEBUG ONLY"); root.addView(title);
    EditText editor = new EditText(this); editor.setContentDescription("Host message"); editor.setHint("Only ciphertext should appear here"); editor.setTextSize(12); editor.setMaxLines(3); root.addView(editor);
    Button copy = new Button(this); copy.setText("Copy received message"); copy.setOnClickListener(v -> ((ClipboardManager)getSystemService(CLIPBOARD_SERVICE)).setPrimaryClip(ClipData.newPlainText("Encrypted message", editor.getText().toString()))); root.addView(copy);
    setContentView(root); editor.requestFocus();
  }
}
