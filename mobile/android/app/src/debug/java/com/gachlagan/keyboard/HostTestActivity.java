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
    Button clear = new Button(this); clear.setText("Clear host message"); clear.setOnClickListener(v -> editor.setText("")); root.addView(clear);
    Button fill = new Button(this); fill.setText("Fill host message"); fill.setOnClickListener(v -> { editor.setText("hold and selection deletion"); editor.setSelection(editor.length()); }); root.addView(fill);
    Button selectAll = new Button(this); selectAll.setText("Select all host message"); selectAll.setOnClickListener(v -> { editor.requestFocus(); editor.selectAll(); }); root.addView(selectAll);
    setContentView(root); editor.requestFocus();
  }
}
