package com.zeroxcryp;

import android.app.Activity;
import android.app.AlertDialog;
import android.content.ClipData;
import android.content.ClipboardManager;
import android.content.ContentResolver;
import android.content.ContentValues;
import android.content.Context;
import android.content.Intent;
import android.database.Cursor;
import android.database.sqlite.SQLiteDatabase;
import android.database.sqlite.SQLiteOpenHelper;
import android.graphics.Typeface;
import android.graphics.drawable.GradientDrawable;
import android.net.Uri;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.text.InputType;
import android.view.Gravity;
import android.view.View;
import android.view.ViewGroup;
import android.view.Window;
import android.view.WindowManager;
import android.widget.Button;
import android.widget.EditText;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.TextView;
import android.widget.Toast;

import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;
import java.security.SecureRandom;
import java.util.HashMap;
import java.util.Map;
import java.util.UUID;

import javax.crypto.Cipher;
import javax.crypto.SecretKeyFactory;
import javax.crypto.spec.GCMParameterSpec;
import javax.crypto.spec.PBEKeySpec;
import javax.crypto.spec.SecretKeySpec;

public class MainActivity extends Activity {
    private static final int REQUEST_EXPORT = 41;
    private static final int REQUEST_IMPORT = 42;
    private static final int REQUEST_EXPORT_PLAIN = 43;
    private static final int BG = 0xFF0B0D0B;
    private static final int CARD = 0xFF151A14;
    private static final int LINE = 0xFF2B3327;
    private static final int TEXT = 0xFFF4F5EF;
    private static final int MUTED = 0xFF9AA393;
    private static final int ACCENT = 0xFFD4F56E;
    private static final String EXTRA_CHECK = "zeroxcryp-extra-check-v1";
    private static final int ITERATIONS = 310000;

    private VaultDb db;
    private JSONObject account;
    private JSONObject vault;
    private String masterPassword;
    private String pendingPlainExport;
    private final Map<String, String> revealed = new HashMap<>();
    private final Handler idleHandler = new Handler(Looper.getMainLooper());
    private final Handler revealHandler = new Handler(Looper.getMainLooper());
    private Runnable idleLock;

    @Override public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        getWindow().setStatusBarColor(BG);
        getWindow().setNavigationBarColor(BG);
        getWindow().setFlags(WindowManager.LayoutParams.FLAG_SECURE, WindowManager.LayoutParams.FLAG_SECURE);
        db = new VaultDb(this);
        account = db.readAccount();
        if (account == null) showRegistration(); else showLogin();
    }

    @Override public boolean dispatchTouchEvent(android.view.MotionEvent event) {
        if (vault != null) resetIdleTimer();
        return super.dispatchTouchEvent(event);
    }

    @Override protected void onDestroy() {
        idleHandler.removeCallbacksAndMessages(null);
        revealHandler.removeCallbacksAndMessages(null);
        super.onDestroy();
    }

    private int dp(float value) { return (int) (value * getResources().getDisplayMetrics().density + 0.5f); }

    private LinearLayout column(int padding) {
        LinearLayout view = new LinearLayout(this);
        view.setOrientation(LinearLayout.VERTICAL);
        view.setPadding(dp(padding), dp(padding), dp(padding), dp(padding));
        view.setBackgroundColor(BG);
        return view;
    }

    private LinearLayout surface(int padding) {
        LinearLayout view = column(padding);
        view.setBackground(roundRect(CARD, LINE, 16));
        return view;
    }

    private TextView text(String value, float size, int color, boolean bold) {
        TextView view = new TextView(this);
        view.setText(value);
        view.setTextSize(size);
        view.setTextColor(color);
        if (bold) view.setTypeface(Typeface.DEFAULT, Typeface.BOLD);
        view.setIncludeFontPadding(false);
        return view;
    }

    private EditText field(String hint, boolean secret) {
        EditText input = new EditText(this);
        input.setSingleLine(true);
        input.setTextColor(TEXT);
        input.setHintTextColor(0xFF778071);
        input.setHint(hint);
        input.setImportantForAutofill(View.IMPORTANT_FOR_AUTOFILL_NO_EXCLUDE_DESCENDANTS);
        input.setTextSize(14);
        input.setPadding(dp(14), 0, dp(14), 0);
        input.setBackground(roundRect(0xFF10130F, LINE, 10));
        input.setSelectAllOnFocus(false);
        if (secret) input.setInputType(InputType.TYPE_CLASS_TEXT | InputType.TYPE_TEXT_VARIATION_PASSWORD);
        return input;
    }

    private GradientDrawable roundRect(int color, int stroke, int radius) {
        GradientDrawable d = new GradientDrawable();
        d.setColor(color);
        d.setCornerRadius(dp(radius));
        if (stroke != 0) d.setStroke(dp(1), stroke);
        return d;
    }

    private Button button(String label, boolean primary) {
        Button b = new Button(this);
        b.setText(label);
        b.setAllCaps(false);
        b.setTextSize(13);
        b.setTypeface(Typeface.DEFAULT, Typeface.BOLD);
        b.setTextColor(primary ? 0xFF182013 : TEXT);
        GradientDrawable shape = roundRect(primary ? ACCENT : 0xFF1A2018, primary ? 0 : LINE, 11);
        android.content.res.ColorStateList ripple = android.content.res.ColorStateList.valueOf(primary ? 0x33566B20 : 0x33FFFFFF);
        b.setBackground(new android.graphics.drawable.RippleDrawable(ripple, shape, roundRect(0xFFFFFFFF, 0, 11)));
        b.setPadding(dp(15), dp(7), dp(15), dp(7));
        b.setMinHeight(dp(44));
        b.setElevation(0f);
        b.setStateListAnimator(null);
        return b;
    }

    private void addField(LinearLayout parent, String label, EditText input) {
        TextView caption = text(label.toUpperCase(), 10, 0xFFB7C0AE, true);
        caption.setLetterSpacing(0.08f);
        LinearLayout.LayoutParams labelParams = new LinearLayout.LayoutParams(-1, -2);
        labelParams.topMargin = dp(17);
        labelParams.bottomMargin = dp(8);
        parent.addView(caption, labelParams);
        parent.addView(input, new LinearLayout.LayoutParams(-1, dp(48)));
    }

    private ScrollView page(LinearLayout content) {
        ScrollView scroll = new ScrollView(this);
        scroll.setFillViewport(true);
        scroll.setBackgroundColor(BG);
        scroll.setClipToPadding(false);
        scroll.setVerticalScrollBarEnabled(false);
        scroll.setPadding(0, dp(8), 0, dp(18));
        scroll.addView(content);
        return scroll;
    }

    private void addBrand(LinearLayout root) {
        LinearLayout row = new LinearLayout(this); row.setGravity(Gravity.CENTER_VERTICAL);
        TextView mark = text("⬟", 21, 0xFF182013, true); mark.setGravity(Gravity.CENTER);
        mark.setBackground(roundRect(ACCENT, 0, 12));
        row.addView(mark, new LinearLayout.LayoutParams(dp(42), dp(42)));
        LinearLayout brandStack = new LinearLayout(this); brandStack.setOrientation(LinearLayout.VERTICAL);
        LinearLayout.LayoutParams p = new LinearLayout.LayoutParams(-2, -2); p.leftMargin = dp(11); row.addView(brandStack, p);
        TextView brand = text("ZeroXCryp", 18, TEXT, true); brandStack.addView(brand);
        TextView caption = text("GESTOR LOCAL CIFRADO", 8, MUTED, true); caption.setLetterSpacing(0.12f); caption.setPadding(0, dp(3), 0, 0); brandStack.addView(caption);
        root.addView(row);
    }

    private void showRegistration() {
        LinearLayout root = column(24);
        addBrand(root);
        TextView eyebrow = text("UNA BÓVEDA, SOLO TUYA", 10, ACCENT, true);
        eyebrow.setLetterSpacing(0.14f);
        LinearLayout.LayoutParams ep = new LinearLayout.LayoutParams(-1, -2); ep.topMargin = dp(46);
        root.addView(eyebrow, ep);
        TextView title = text("Privacidad en\ntus manos.", 38, TEXT, false);
        title.setTypeface(Typeface.create("serif", Typeface.NORMAL));
        LinearLayout.LayoutParams tp = new LinearLayout.LayoutParams(-1, -2); tp.topMargin = dp(12);
        root.addView(title, tp);
        TextView sub = text("Crea una bóveda personal. Solo tú puedes abrirla desde este teléfono.", 13, MUTED, false);
        LinearLayout.LayoutParams sp = new LinearLayout.LayoutParams(-1, -2); sp.topMargin = dp(10);
        root.addView(sub, sp);

        EditText name = field("Cómo te llamas", false);
        EditText email = field("tu@correo.com", false);
        email.setInputType(InputType.TYPE_CLASS_TEXT | InputType.TYPE_TEXT_VARIATION_EMAIL_ADDRESS);
        EditText master = field("12 caracteres o más", true);
        EditText extra = field("Una segunda frase secreta", true);
        LinearLayout form = surface(17);
        LinearLayout.LayoutParams formParams = new LinearLayout.LayoutParams(-1, -2); formParams.topMargin = dp(23);
        root.addView(form, formParams);
        addField(form, "Nombre", name);
        addField(form, "Correo electrónico", email);
        addField(form, "Contraseña principal", master);
        addField(form, "Clave extra", extra);

        TextView note = text("Usa dos claves distintas. La clave extra se solicita para guardar, mostrar o copiar cada contraseña.", 11, MUTED, false);
        LinearLayout.LayoutParams np = new LinearLayout.LayoutParams(-1, -2); np.topMargin = dp(13);
        form.addView(note, np);
        Button create = button("Crear mi bóveda  →", true);
        LinearLayout.LayoutParams bp = new LinearLayout.LayoutParams(-1, dp(54)); bp.topMargin = dp(18);
        root.addView(create, bp);
        create.setOnClickListener(v -> {
            String n = name.getText().toString().trim(), e = email.getText().toString().trim(), m = master.getText().toString(), x = extra.getText().toString();
            if (n.isEmpty() || !e.contains("@")) { toast("Escribe tu nombre y un correo válido."); return; }
            if (m.length() < 12 || x.length() < 12) { toast("Ambas claves deben tener al menos 12 caracteres."); return; }
            if (m.equals(x)) { toast("La contraseña principal y la clave extra deben ser diferentes."); return; }
            try { createVault(n, e, m, x); }
            catch (Exception ex) { toast("No se pudo crear la bóveda."); }
        });
        setContentView(page(root));
    }

    private void createVault(String name, String email, String master, String extra) throws Exception {
        byte[] masterSalt = randomBytes(16), extraSalt = randomBytes(16);
        JSONObject profile = new JSONObject(); profile.put("name", name); profile.put("email", email.toLowerCase());
        JSONObject data = new JSONObject(); data.put("version", 1); data.put("profile", profile); data.put("entries", new JSONArray());
        account = new JSONObject(); account.put("version", 1); account.put("salt", b64(masterSalt)); account.put("extraSalt", b64(extraSalt));
        account.put("extraCheck", seal(derive(extra, extraSalt), EXTRA_CHECK));
        masterPassword = master;
        vault = data;
        persistVault();
        showVault();
        toast("Bóveda creada y cifrada en este teléfono.");
    }

    private void showLogin() {
        LinearLayout root = column(24);
        addBrand(root);
        TextView eyebrow = text("ACCESO LOCAL", 10, ACCENT, true);
        eyebrow.setLetterSpacing(0.14f);
        LinearLayout.LayoutParams ep = new LinearLayout.LayoutParams(-1, -2); ep.topMargin = dp(62);
        root.addView(eyebrow, ep);
        TextView title = text("Desbloquea\ntu bóveda.", 38, TEXT, false);
        title.setTypeface(Typeface.create("serif", Typeface.NORMAL));
        LinearLayout.LayoutParams tp = new LinearLayout.LayoutParams(-1, -2); tp.topMargin = dp(12);
        root.addView(title, tp);
        TextView sub = text("Tu bóveda está cifrada y permanece en este dispositivo.", 13, MUTED, false);
        LinearLayout.LayoutParams sp = new LinearLayout.LayoutParams(-1, -2); sp.topMargin = dp(8);
        root.addView(sub, sp);
        EditText master = field("Contraseña principal", true);
        LinearLayout form = surface(17);
        LinearLayout.LayoutParams formParams = new LinearLayout.LayoutParams(-1, -2); formParams.topMargin = dp(24);
        root.addView(form, formParams); addField(form, "Contraseña principal", master);
        Button unlock = button("Desbloquear bóveda  →", true);
        LinearLayout.LayoutParams bp = new LinearLayout.LayoutParams(-1, dp(54)); bp.topMargin = dp(16);
        form.addView(unlock, bp);
        unlock.setOnClickListener(v -> {
            String password = master.getText().toString();
            try {
                JSONObject box = account.getJSONObject("box");
                vault = new JSONObject(unseal(derive(password, unb64(account.getString("salt"))), box));
                masterPassword = password;
                revealed.clear();
                showVault();
            } catch (Exception ex) { toast("La contraseña principal no coincide."); }
        });
        Button restore = button("Restaurar copia cifrada", false);
        LinearLayout.LayoutParams rp = new LinearLayout.LayoutParams(-1, dp(46)); rp.topMargin = dp(10);
        root.addView(restore, rp);
        restore.setOnClickListener(v -> openImport());
        setContentView(page(root));
    }

    private void showVault() {
        resetIdleTimer();
        LinearLayout root = column(20);
        LinearLayout top = new LinearLayout(this); top.setGravity(Gravity.CENTER_VERTICAL);
        TextView mark = text("⬟", 19, 0xFF182013, true); mark.setGravity(Gravity.CENTER); mark.setBackground(roundRect(ACCENT, 0, 11));
        top.addView(mark, new LinearLayout.LayoutParams(dp(38), dp(38)));
        LinearLayout brandStack = new LinearLayout(this); brandStack.setOrientation(LinearLayout.VERTICAL);
        LinearLayout.LayoutParams brandParams = new LinearLayout.LayoutParams(0, -2, 1); brandParams.leftMargin = dp(9); top.addView(brandStack, brandParams);
        brandStack.addView(text("ZeroXCryp", 17, TEXT, true));
        TextView local = text("●  SOLO EN ESTE TELÉFONO", 8, MUTED, true); local.setLetterSpacing(0.08f); local.setPadding(0, dp(3), 0, 0); brandStack.addView(local);
        Button settings = button("⋯", false); top.addView(settings, new LinearLayout.LayoutParams(dp(46), dp(42)));
        root.addView(top);

        JSONObject profile = vault.optJSONObject("profile");
        String first = profile == null ? "" : profile.optString("name", "").split(" ")[0];
        TextView eyebrow = text("ESPACIO PRIVADO", 10, ACCENT, true);
        eyebrow.setLetterSpacing(0.14f);
        LinearLayout.LayoutParams ep = new LinearLayout.LayoutParams(-1, -2); ep.topMargin = dp(35);
        root.addView(eyebrow, ep);
        TextView title = text("Tu bóveda", 36, TEXT, false); title.setTypeface(Typeface.create("serif", Typeface.NORMAL));
        LinearLayout.LayoutParams tp = new LinearLayout.LayoutParams(-1, -2); tp.topMargin = dp(8);
        root.addView(title, tp);
        JSONArray entries = vault.optJSONArray("entries"); int count = entries == null ? 0 : entries.length();
        TextView greeting = text("Hola, " + first + ". " + count + (count == 1 ? " acceso protegido." : " accesos protegidos."), 12, MUTED, false);
        LinearLayout.LayoutParams gp = new LinearLayout.LayoutParams(-1, -2); gp.topMargin = dp(6);
        root.addView(greeting, gp);

        LinearLayout actions = new LinearLayout(this); actions.setOrientation(LinearLayout.HORIZONTAL);
        Button add = button("＋  Nueva clave", true);
        Button backup = button("↥  Copia", false);
        LinearLayout.LayoutParams a = new LinearLayout.LayoutParams(0, dp(48), 1); a.topMargin = dp(20); a.rightMargin = dp(5);
        LinearLayout.LayoutParams b = new LinearLayout.LayoutParams(0, dp(48), 1); b.topMargin = dp(20); b.leftMargin = dp(5);
        actions.addView(add, a); actions.addView(backup, b); root.addView(actions);
        add.setOnClickListener(v -> showEntryDialog(null));
        backup.setOnClickListener(v -> showBackupOptions());
        settings.setOnClickListener(v -> showSettings());

        if (entries == null || entries.length() == 0) {
            LinearLayout empty = surface(22); empty.setGravity(Gravity.CENTER);
            LinearLayout.LayoutParams ep2 = new LinearLayout.LayoutParams(-1, -2); ep2.topMargin = dp(18); root.addView(empty, ep2);
            TextView emptyIcon = text("＋", 24, ACCENT, true); emptyIcon.setGravity(Gravity.CENTER); emptyIcon.setBackground(roundRect(0xFF252D20, 0, 18));
            empty.addView(emptyIcon, new LinearLayout.LayoutParams(dp(50), dp(50)));
            TextView emptyTitle = text("Tu bóveda está lista", 17, TEXT, true); emptyTitle.setGravity(Gravity.CENTER);
            LinearLayout.LayoutParams et = new LinearLayout.LayoutParams(-1, -2); et.topMargin = dp(13); empty.addView(emptyTitle, et);
            TextView emptyBody = text("Añade tu primera cuenta para empezar a proteger tus claves.", 12, MUTED, false); emptyBody.setGravity(Gravity.CENTER);
            LinearLayout.LayoutParams eb = new LinearLayout.LayoutParams(-1, -2); eb.topMargin = dp(7); empty.addView(emptyBody, eb);
        } else {
            for (int i = 0; i < entries.length(); i++) {
                JSONObject entry = entries.optJSONObject(i);
                if (entry != null) {
                    LinearLayout.LayoutParams cardParams = new LinearLayout.LayoutParams(-1, -2);
                    cardParams.topMargin = dp(12);
                    root.addView(entryCard(entry), cardParams);
                }
            }
        }
        Button lock = button("Bloquear bóveda", false);
        LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(-1, dp(46)); lp.topMargin = dp(20);
        root.addView(lock, lp); lock.setOnClickListener(v -> lockVault());
        setContentView(page(root));
    }

    private View entryCard(JSONObject entry) {
        LinearLayout card = surface(15);
        LinearLayout heading = new LinearLayout(this); heading.setGravity(Gravity.CENTER_VERTICAL);
        String entryName = entry.optString("name", "?");
        TextView siteIcon = text(entryName.isEmpty() ? "?" : entryName.substring(0, 1).toUpperCase(), 16, ACCENT, true);
        siteIcon.setGravity(Gravity.CENTER); siteIcon.setBackground(roundRect(0xFF252D20, 0, 12));
        heading.addView(siteIcon, new LinearLayout.LayoutParams(dp(42), dp(42)));
        LinearLayout meta = new LinearLayout(this); meta.setOrientation(LinearLayout.VERTICAL);
        LinearLayout.LayoutParams mp = new LinearLayout.LayoutParams(0, -2, 1); mp.leftMargin = dp(11); heading.addView(meta, mp);
        meta.addView(text(entryName, 14, TEXT, true));
        String url = entry.optString("url", "");
        TextView urlText = text(url.isEmpty() ? "Sin URL" : url, 10, MUTED, false); urlText.setMaxLines(1); urlText.setPadding(0, dp(4), 0, 0);
        meta.addView(urlText);
        Button more = button("⋯", false); heading.addView(more, new LinearLayout.LayoutParams(dp(42), dp(38)));
        more.setOnClickListener(v -> showEntryMenu(entry));
        card.addView(heading);
        View divider = new View(this); divider.setBackgroundColor(0x252F372A);
        LinearLayout.LayoutParams dpv = new LinearLayout.LayoutParams(-1, dp(1)); dpv.topMargin = dp(14); dpv.bottomMargin = dp(13); card.addView(divider, dpv);
        TextView userLabel = text("USUARIO", 9, 0xFF899381, true); userLabel.setLetterSpacing(0.1f); card.addView(userLabel);
        TextView user = text(entry.optString("username", "Sin usuario"), 12, 0xFFD4D9CF, false);
        LinearLayout.LayoutParams up = new LinearLayout.LayoutParams(-1, -2); up.topMargin = dp(3); card.addView(user, up);
        LinearLayout pwRow = new LinearLayout(this); pwRow.setGravity(Gravity.CENTER_VERTICAL);
        TextView pwLabel = text("CONTRASEÑA", 9, 0xFF899381, true); pwLabel.setLetterSpacing(0.1f); pwRow.addView(pwLabel, new LinearLayout.LayoutParams(0, -2, 1));
        String id = entry.optString("id");
        TextView pw = text(revealed.containsKey(id) ? revealed.get(id) : "••••••••••••", 12, 0xFFD4D9CF, false); pw.setSingleLine(true); pw.setEllipsize(android.text.TextUtils.TruncateAt.MIDDLE);
        LinearLayout.LayoutParams pwp = new LinearLayout.LayoutParams(0, -2, 2); pwRow.addView(pw, pwp);
        Button reveal = button(revealed.containsKey(id) ? "Ocultar" : "Ver", false);
        LinearLayout.LayoutParams rp = new LinearLayout.LayoutParams(-2, dp(36)); rp.leftMargin = dp(5); pwRow.addView(reveal, rp);
        Button copy = button("Copiar", false); LinearLayout.LayoutParams cp = new LinearLayout.LayoutParams(-2, dp(36)); cp.leftMargin = dp(5); pwRow.addView(copy, cp);
        LinearLayout.LayoutParams pwrp = new LinearLayout.LayoutParams(-1, -2); pwrp.topMargin = dp(8); card.addView(pwRow, pwrp);
        reveal.setOnClickListener(v -> {
            if (revealed.containsKey(id)) { revealed.remove(id); showVault(); }
            else promptExtra("Mostrar contraseña", extra -> {
                try { revealed.put(id, decryptEntry(entry, extra)); showVault(); revealHandler.postDelayed(() -> { if (revealed.remove(id) != null && vault != null) showVault(); }, 30000); }
                catch (Exception ex) { toast("No se pudo descifrar la contraseña."); }
            });
        });
        copy.setOnClickListener(v -> promptExtra("Verificar y copiar", extra -> {
            try {
                String password = decryptEntry(entry, extra);
                ClipboardManager clipboard = (ClipboardManager) getSystemService(CLIPBOARD_SERVICE);
                clipboard.setPrimaryClip(ClipData.newPlainText("ZeroXCryp password", password));
                toast("Contraseña copiada.");
            } catch (Exception ex) { toast("No se pudo descifrar la contraseña."); }
        }));
        return card;
    }

    private void showEntryMenu(JSONObject entry) {
        String[] options = {"Editar", "Eliminar"};
        new AlertDialog.Builder(this).setTitle(entry.optString("name")).setItems(options, (dialog, which) -> {
            if (which == 0) showEntryDialog(entry); else confirmDelete(entry);
        }).show();
    }

    private void showEntryDialog(JSONObject existing) {
        boolean editing = existing != null;
        LinearLayout form = column(18); form.setBackgroundColor(CARD);
        EditText name = field("Ej. Correo personal", false); name.setText(editing ? existing.optString("name") : "");
        EditText username = field("nombre@correo.com", false); username.setText(editing ? existing.optString("username") : "");
        EditText url = field("ejemplo.com", false); url.setText(editing ? existing.optString("url") : "");
        EditText password = field(editing ? "Vacío para conservarla" : "Escribe la contraseña", true);
        EditText extra = field("Confirma tu clave extra", true);
        addField(form, "Nombre del acceso", name); addField(form, "Usuario o correo", username); addField(form, "Sitio web", url);
        addField(form, editing ? "Nueva contraseña (opcional)" : "Contraseña", password); addField(form, "Clave extra", extra);
        AlertDialog dialog = new AlertDialog.Builder(this).setTitle(editing ? "Editar acceso" : "Añadir un acceso").setView(form)
                .setNegativeButton("Cancelar", null).setPositiveButton(editing ? "Guardar cambios" : "Guardar acceso", null).create();
        dialog.setOnShowListener(ignored -> dialog.getButton(AlertDialog.BUTTON_POSITIVE).setOnClickListener(v -> {
            if (name.getText().toString().trim().isEmpty()) { toast("Escribe el nombre de este acceso."); return; }
            if (!editing && password.getText().length() == 0) { toast("Escribe la contraseña."); return; }
            String extraText = extra.getText().toString();
            try {
                if (!verifyExtra(extraText)) { toast("La clave extra no coincide."); return; }
                JSONObject target;
                if (editing) target = existing; else { target = new JSONObject(); target.put("id", UUID.randomUUID().toString()); target.put("createdAt", System.currentTimeMillis()); }
                target.put("name", name.getText().toString().trim()); target.put("username", username.getText().toString().trim()); target.put("url", url.getText().toString().trim());
                if (!editing || password.getText().length() > 0) target.put("passwordBox", encryptEntry(password.getText().toString(), extraText));
                if (!editing) vault.getJSONArray("entries").put(0, target);
                persistVault(); dialog.dismiss(); revealed.clear(); showVault();
                toast(editing ? "Acceso actualizado." : "Acceso guardado.");
            } catch (Exception ex) { toast("No se pudo guardar este acceso."); }
        }));
        dialog.show();
        dialog.getWindow().setSoftInputMode(WindowManager.LayoutParams.SOFT_INPUT_STATE_ALWAYS_HIDDEN);
    }

    private void confirmDelete(JSONObject entry) {
        new AlertDialog.Builder(this).setTitle("Eliminar acceso")
                .setMessage("Se eliminará “" + entry.optString("name") + "” de la bóveda.")
                .setNegativeButton("Cancelar", null).setPositiveButton("Eliminar", (dialog, which) -> {
                    JSONArray old = vault.optJSONArray("entries"); JSONArray filtered = new JSONArray();
                    if (old != null) for (int i = 0; i < old.length(); i++) { JSONObject item = old.optJSONObject(i); if (item != null && !item.optString("id").equals(entry.optString("id"))) filtered.put(item); }
                    try { vault.put("entries", filtered); revealed.remove(entry.optString("id")); persistVault(); showVault(); }
                    catch (Exception ex) { toast("No se pudo actualizar la bóveda."); }
                }).show();
    }

    private interface ExtraCallback { void accept(String extra); }
    private void promptExtra(String action, ExtraCallback callback) {
        EditText input = field("Tu segunda clave secreta", true);
        LinearLayout wrap = column(16); wrap.setBackgroundColor(CARD); wrap.addView(input, new LinearLayout.LayoutParams(-1, dp(48)));
        new AlertDialog.Builder(this).setTitle("Confirma tu clave extra").setMessage("Protege el acceso a esta contraseña.")
                .setView(wrap).setNegativeButton("Cancelar", null).setPositiveButton(action, (dialog, which) -> {
                    String extra = input.getText().toString();
                    try { if (!verifyExtra(extra)) { toast("La clave extra no coincide."); return; } callback.accept(extra); }
                    catch (Exception ex) { toast("No se pudo verificar la clave extra."); }
                }).show();
    }

    private void showSettings() {
        String[] options = {"Guardar copia cifrada", "Restaurar copia cifrada", "Exportar JSON con claves", "Bloquear bóveda"};
        new AlertDialog.Builder(this).setTitle("ZeroXCryp").setItems(options, (d, which) -> {
            if (which == 0) exportBackup();
            else if (which == 1) openImport();
            else if (which == 2) confirmPlainExport();
            else lockVault();
        }).show();
    }

    private void showBackupOptions() {
        String[] options = {"Guardar copia cifrada", "Restaurar copia cifrada", "Exportar JSON con claves"};
        new AlertDialog.Builder(this).setTitle("Copia / Google Drive")
                .setMessage("La copia cifrada protege tus claves. También puedes exportar un JSON legible y elegir Google Drive en el selector de Android.")
                .setItems(options, (d, which) -> {
                    if (which == 0) exportBackup();
                    else if (which == 1) openImport();
                    else confirmPlainExport();
                }).show();
    }

    private void confirmPlainExport() {
        new AlertDialog.Builder(this).setTitle("Exportar claves como JSON")
                .setMessage("El archivo incluirá tus contraseñas en texto legible, sin cifrar. Cualquier persona que pueda abrir el archivo podrá leerlas. Guárdalo solo en un lugar seguro.")
                .setNegativeButton("Cancelar", null)
                .setPositiveButton("Continuar", (dialog, which) -> promptExtra("Verificar y exportar", this::preparePlainExport))
                .show();
    }

    private void preparePlainExport(String extra) {
        final JSONObject snapshot;
        try { snapshot = new JSONObject(vault.toString()); }
        catch (Exception ex) { toast("No se pudo leer la bóveda."); return; }
        AlertDialog progress = new AlertDialog.Builder(this)
                .setTitle("Preparando exportación")
                .setMessage("Descifrando las claves para crear el archivo JSON…")
                .setCancelable(false).create();
        progress.show();
        Thread worker = new Thread(() -> {
            try {
                JSONObject exported = new JSONObject();
                exported.put("format", "zeroxcryp-plain-credentials");
                exported.put("version", 1);
                exported.put("exportedAt", System.currentTimeMillis());
                if (snapshot.has("profile")) exported.put("profile", new JSONObject(snapshot.getJSONObject("profile").toString()));
                JSONArray credentials = new JSONArray();
                JSONArray entries = snapshot.optJSONArray("entries");
                if (entries != null) {
                    for (int i = 0; i < entries.length(); i++) {
                        JSONObject entry = entries.optJSONObject(i);
                        if (entry == null) continue;
                        JSONObject credential = new JSONObject();
                        credential.put("name", entry.optString("name", ""));
                        credential.put("url", entry.optString("url", ""));
                        credential.put("username", entry.optString("username", ""));
                        credential.put("password", decryptEntry(entry, extra));
                        credential.put("createdAt", entry.optLong("createdAt", 0));
                        credentials.put(credential);
                    }
                }
                exported.put("entries", credentials);
                String json = exported.toString(2);
                runOnUiThread(() -> {
                    progress.dismiss();
                    pendingPlainExport = json;
                    openPlainExport();
                });
            } catch (Exception ex) {
                runOnUiThread(() -> {
                    progress.dismiss();
                    toast("No se pudo preparar el JSON. No se creó ningún archivo.");
                });
            }
        }, "ZeroXCryp-JSON-export");
        worker.start();
    }

    private void openPlainExport() {
        Intent intent = new Intent(Intent.ACTION_CREATE_DOCUMENT);
        intent.addCategory(Intent.CATEGORY_OPENABLE);
        intent.setType("application/json");
        intent.putExtra(Intent.EXTRA_TITLE, "ZeroXCryp-claves-sin-cifrar.json");
        startActivityForResult(intent, REQUEST_EXPORT_PLAIN);
    }

    private void exportBackup() {
        Intent intent = new Intent(Intent.ACTION_CREATE_DOCUMENT);
        intent.addCategory(Intent.CATEGORY_OPENABLE);
        intent.setType("application/json");
        intent.putExtra(Intent.EXTRA_TITLE, "ZeroXCryp-copia.json");
        startActivityForResult(intent, REQUEST_EXPORT);
    }

    private void openImport() {
        Intent intent = new Intent(Intent.ACTION_OPEN_DOCUMENT);
        intent.addCategory(Intent.CATEGORY_OPENABLE);
        intent.setType("application/json");
        startActivityForResult(intent, REQUEST_IMPORT);
    }

    @Override protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        super.onActivityResult(requestCode, resultCode, data);
        if (requestCode == REQUEST_EXPORT_PLAIN) {
            if (resultCode != RESULT_OK || data == null || data.getData() == null) {
                pendingPlainExport = null;
                return;
            }
            Uri target = data.getData();
            String json = pendingPlainExport;
            pendingPlainExport = null;
            try (OutputStream output = getContentResolver().openOutputStream(target)) {
                if (output == null || json == null) throw new Exception("No se pudo abrir el archivo.");
                output.write(json.getBytes(StandardCharsets.UTF_8));
                toast("JSON con claves exportado. Mantén el archivo protegido.");
            } catch (Exception ex) { toast("No se pudo guardar el JSON con claves."); }
            return;
        }
        if (resultCode != RESULT_OK || data == null || data.getData() == null) return;
        Uri uri = data.getData();
        if (requestCode == REQUEST_EXPORT) {
            try (OutputStream output = getContentResolver().openOutputStream(uri)) {
                JSONObject backup = new JSONObject(); backup.put("format", "zeroxcryp-vault"); backup.put("version", 1); backup.put("account", account);
                output.write(backup.toString().getBytes(StandardCharsets.UTF_8)); toast("Copia cifrada guardada.");
            } catch (Exception ex) { toast("No se pudo guardar la copia."); }
        } else if (requestCode == REQUEST_IMPORT) {
            try (InputStream input = getContentResolver().openInputStream(uri)) {
                ByteArrayOutputStream buffer = new ByteArrayOutputStream(); byte[] bytes = new byte[4096]; int count;
                while ((count = input.read(bytes)) != -1) buffer.write(bytes, 0, count);
                JSONObject backup = new JSONObject(buffer.toString(StandardCharsets.UTF_8.name()));
                if (!"zeroxcryp-vault".equals(backup.optString("format")) || backup.optInt("version") != 1) throw new Exception("Archivo incompatible.");
                JSONObject imported = backup.getJSONObject("account");
                promptMasterForImport(imported);
            } catch (Exception ex) { toast("El archivo no es una copia válida de ZeroXCryp."); }
        }
    }

    private void promptMasterForImport(JSONObject imported) {
        EditText input = field("Contraseña principal de la copia", true);
        LinearLayout wrap = column(16); wrap.setBackgroundColor(CARD); wrap.addView(input, new LinearLayout.LayoutParams(-1, dp(48)));
        new AlertDialog.Builder(this).setTitle("Verificar copia").setMessage("Escribe la contraseña principal de la copia para restaurarla.")
                .setView(wrap).setNegativeButton("Cancelar", null).setPositiveButton("Restaurar", (d, w) -> {
                    String master = input.getText().toString();
                    try {
                        JSONObject importedVault = new JSONObject(unseal(derive(master, unb64(imported.getString("salt"))), imported.getJSONObject("box")));
                        db.saveAccount(imported); account = imported; vault = importedVault; masterPassword = master; revealed.clear(); showVault(); toast("Copia restaurada.");
                    } catch (Exception ex) { toast("La contraseña principal no coincide con la copia."); }
                }).show();
    }

    private JSONObject encryptEntry(String password, String extra) throws Exception {
        byte[] salt = randomBytes(16);
        JSONObject box = seal(derive(extra, salt), password);
        box.put("salt", b64(salt));
        return box;
    }

    private String decryptEntry(JSONObject entry, String extra) throws Exception {
        JSONObject box = entry.getJSONObject("passwordBox");
        return unseal(derive(extra, unb64(box.getString("salt"))), box);
    }

    private boolean verifyExtra(String extra) throws Exception {
        String expected = unseal(derive(extra, unb64(account.getString("extraSalt"))), account.getJSONObject("extraCheck"));
        return EXTRA_CHECK.equals(expected);
    }

    private void persistVault() throws Exception {
        byte[] salt = unb64(account.getString("salt"));
        account.put("box", seal(derive(masterPassword, salt), vault.toString()));
        account.put("updatedAt", System.currentTimeMillis());
        db.saveAccount(account);
    }

    private void lockVault() {
        idleHandler.removeCallbacksAndMessages(null);
        revealHandler.removeCallbacksAndMessages(null);
        vault = null; masterPassword = null; revealed.clear();
        account = db.readAccount();
        if (account == null) showRegistration(); else showLogin();
    }

    private void resetIdleTimer() {
        if (idleLock != null) idleHandler.removeCallbacks(idleLock);
        idleLock = this::lockVault;
        idleHandler.postDelayed(idleLock, 5 * 60 * 1000L);
    }

    private void toast(String message) { Toast.makeText(this, message, Toast.LENGTH_SHORT).show(); }

    private static byte[] randomBytes(int length) { byte[] bytes = new byte[length]; new SecureRandom().nextBytes(bytes); return bytes; }
    private static String b64(byte[] bytes) { return android.util.Base64.encodeToString(bytes, android.util.Base64.NO_WRAP); }
    private static byte[] unb64(String text) { return android.util.Base64.decode(text, android.util.Base64.NO_WRAP); }

    private static javax.crypto.SecretKey derive(String password, byte[] salt) throws Exception {
        PBEKeySpec spec = new PBEKeySpec(password.toCharArray(), salt, ITERATIONS, 256);
        byte[] key = SecretKeyFactory.getInstance("PBKDF2WithHmacSHA256").generateSecret(spec).getEncoded();
        spec.clearPassword();
        return new SecretKeySpec(key, "AES");
    }

    private static JSONObject seal(javax.crypto.SecretKey key, String plain) throws Exception {
        byte[] iv = randomBytes(12);
        Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
        cipher.init(Cipher.ENCRYPT_MODE, key, new GCMParameterSpec(128, iv));
        byte[] encrypted = cipher.doFinal(plain.getBytes(StandardCharsets.UTF_8));
        JSONObject box = new JSONObject(); box.put("iv", b64(iv)); box.put("cipher", b64(encrypted)); return box;
    }

    private static String unseal(javax.crypto.SecretKey key, JSONObject box) throws Exception {
        Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
        cipher.init(Cipher.DECRYPT_MODE, key, new GCMParameterSpec(128, unb64(box.getString("iv"))));
        byte[] plain = cipher.doFinal(unb64(box.getString("cipher")));
        return new String(plain, StandardCharsets.UTF_8);
    }

    private static class VaultDb extends SQLiteOpenHelper {
        VaultDb(Context context) { super(context, "zeroxcryp.db", null, 1); }
        @Override public void onCreate(SQLiteDatabase database) { database.execSQL("CREATE TABLE account (id INTEGER PRIMARY KEY CHECK(id = 1), payload TEXT NOT NULL)"); }
        @Override public void onUpgrade(SQLiteDatabase database, int oldVersion, int newVersion) { }
        JSONObject readAccount() {
            try (Cursor cursor = getReadableDatabase().rawQuery("SELECT payload FROM account WHERE id=1", null)) {
                return cursor.moveToFirst() ? new JSONObject(cursor.getString(0)) : null;
            } catch (Exception ignored) { return null; }
        }
        void saveAccount(JSONObject account) {
            ContentValues values = new ContentValues(); values.put("id", 1); values.put("payload", account.toString());
            getWritableDatabase().insertWithOnConflict("account", null, values, SQLiteDatabase.CONFLICT_REPLACE);
        }
    }
}
