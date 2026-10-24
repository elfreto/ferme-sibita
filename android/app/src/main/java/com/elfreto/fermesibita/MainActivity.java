package com.elfreto.fermesibita;

import android.app.Activity;
import android.content.ActivityNotFoundException;
import android.content.ContentResolver;
import android.content.ContentValues;
import android.content.Intent;
import android.graphics.Color;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.provider.MediaStore;
import android.util.Base64;
import android.webkit.JavascriptInterface;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.FrameLayout;
import android.widget.Toast;

import androidx.core.content.FileProvider;
import androidx.core.graphics.Insets;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowInsetsCompat;

import java.io.File;
import java.io.FileOutputStream;
import java.io.OutputStream;

/**
 * Enveloppe Android de l'application en ligne : elle affiche le site,
 * qui garde ses mises à jour automatiques et marche hors ligne grâce à son service worker.
 */
public class MainActivity extends Activity {

    private static final String ADRESSE = "https://elfreto.github.io/ferme-sibita/";
    private static final String PAGE_HORS_LIGNE = "file:///android_asset/hors-ligne.html";
    private static final int CHOIX_FICHIER = 1;

    /** Les fichiers Excel sont créés dans la page (liens blob:) : on les récupère pour les enregistrer. */
    private static final String SCRIPT_TELECHARGEMENT =
        "(function(){"
        + "if(window.__sibitaFichiers)return;window.__sibitaFichiers=true;"
        + "document.addEventListener('click',function(e){"
        + "var a=e.target&&e.target.closest?e.target.closest('a[download]'):null;"
        + "if(!a||!a.href||a.href.indexOf('blob:')!==0)return;"
        + "e.preventDefault();"
        + "var nom=a.getAttribute('download')||'fichier';"
        + "fetch(a.href).then(function(r){return r.blob();}).then(function(b){"
        + "var f=new FileReader();"
        + "f.onload=function(){SibitaAndroid.enregistrer(f.result,nom,b.type||'');};"
        + "f.readAsDataURL(b);"
        + "}).catch(function(){SibitaAndroid.erreur();});"
        + "},true);"
        + "})();";

    private WebView web;
    private ValueCallback<Uri[]> fichierEnAttente;

    @Override
    protected void onCreate(Bundle etat) {
        super.onCreate(etat);

        FrameLayout racine = new FrameLayout(this);
        racine.setBackgroundColor(Color.parseColor("#2f6b3a"));
        web = new WebView(this);
        web.setBackgroundColor(Color.parseColor("#f6f3ea"));
        racine.addView(web, new FrameLayout.LayoutParams(
            FrameLayout.LayoutParams.MATCH_PARENT, FrameLayout.LayoutParams.MATCH_PARENT));
        setContentView(racine);

        // Android 15 dessine sous les barres système : on laisse la place aux barres et au clavier
        ViewCompat.setOnApplyWindowInsetsListener(racine, (v, insets) -> {
            Insets barres = insets.getInsets(WindowInsetsCompat.Type.systemBars());
            Insets clavier = insets.getInsets(WindowInsetsCompat.Type.ime());
            v.setPadding(barres.left, barres.top, barres.right, Math.max(barres.bottom, clavier.bottom));
            return WindowInsetsCompat.CONSUMED;
        });

        WebSettings reglages = web.getSettings();
        reglages.setJavaScriptEnabled(true);
        reglages.setDomStorageEnabled(true);
        reglages.setDatabaseEnabled(true);
        reglages.setCacheMode(WebSettings.LOAD_DEFAULT);
        reglages.setMediaPlaybackRequiresUserGesture(false);
        reglages.setUserAgentString(reglages.getUserAgentString() + " SibitaAndroid/1.0");

        web.addJavascriptInterface(new Pont(), "SibitaAndroid");

        web.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView vue, WebResourceRequest requete) {
                String url = requete.getUrl().toString();
                if (url.startsWith(ADRESSE) || url.startsWith("file:///android_asset/")) return false;
                ouvrirAilleurs(requete.getUrl());
                return true;
            }

            @Override
            public void onPageFinished(WebView vue, String url) {
                vue.evaluateJavascript(SCRIPT_TELECHARGEMENT, null);
            }

            @Override
            public void onReceivedError(WebView vue, WebResourceRequest requete, WebResourceError erreur) {
                // Première ouverture sans internet : rien en mémoire, on explique
                if (requete.isForMainFrame() && requete.getUrl().toString().startsWith(ADRESSE)) {
                    vue.loadUrl(PAGE_HORS_LIGNE);
                }
            }
        });

        web.setWebChromeClient(new WebChromeClient() {
            @Override
            public boolean onShowFileChooser(WebView vue, ValueCallback<Uri[]> rappel, FileChooserParams params) {
                if (fichierEnAttente != null) fichierEnAttente.onReceiveValue(null);
                fichierEnAttente = rappel;
                Intent choix = new Intent(Intent.ACTION_GET_CONTENT);
                choix.addCategory(Intent.CATEGORY_OPENABLE);
                choix.setType("*/*");
                try {
                    startActivityForResult(Intent.createChooser(choix, "Choisir un fichier"), CHOIX_FICHIER);
                } catch (ActivityNotFoundException e) {
                    fichierEnAttente = null;
                    return false;
                }
                return true;
            }
        });

        web.setDownloadListener((url, agent, disposition, type, taille) -> {
            if (url.startsWith("http")) ouvrirAilleurs(Uri.parse(url));
        });

        if (etat != null) web.restoreState(etat);
        else web.loadUrl(ADRESSE);
    }

    @Override
    protected void onSaveInstanceState(Bundle etat) {
        super.onSaveInstanceState(etat);
        web.saveState(etat);
    }

    @Override
    protected void onActivityResult(int code, int resultat, Intent donnees) {
        super.onActivityResult(code, resultat, donnees);
        if (code != CHOIX_FICHIER || fichierEnAttente == null) return;
        Uri[] choisis = null;
        if (resultat == RESULT_OK && donnees != null && donnees.getData() != null) {
            choisis = new Uri[] { donnees.getData() };
        }
        fichierEnAttente.onReceiveValue(choisis);
        fichierEnAttente = null;
    }

    @Override
    @SuppressWarnings("deprecation")
    public void onBackPressed() {
        if (web.canGoBack()) web.goBack();
        else super.onBackPressed();
    }

    @Override
    protected void onDestroy() {
        web.destroy();
        super.onDestroy();
    }

    private void ouvrirAilleurs(Uri uri) {
        try {
            startActivity(new Intent(Intent.ACTION_VIEW, uri));
        } catch (ActivityNotFoundException e) {
            Toast.makeText(this, "Aucune application pour ouvrir ce lien", Toast.LENGTH_SHORT).show();
        }
    }

    /** Appelé depuis la page pour enregistrer un fichier puis proposer de le partager (WhatsApp, etc.). */
    private class Pont {
        @JavascriptInterface
        public void enregistrer(String dataUrl, String nom, String type) {
            try {
                int virgule = dataUrl.indexOf(',');
                byte[] contenu = Base64.decode(dataUrl.substring(virgule + 1), Base64.DEFAULT);
                String mime = type.isEmpty() ? "application/octet-stream" : type;
                boolean dansTelechargements = enregistrerDansTelechargements(contenu, nom, mime);

                File dossier = new File(getCacheDir(), "exports");
                dossier.mkdirs();
                File fichier = new File(dossier, nom);
                try (FileOutputStream sortie = new FileOutputStream(fichier)) {
                    sortie.write(contenu);
                }
                Uri uri = FileProvider.getUriForFile(MainActivity.this, getPackageName() + ".fichiers", fichier);

                runOnUiThread(() -> {
                    if (dansTelechargements) {
                        Toast.makeText(MainActivity.this, "Enregistré dans Téléchargements : " + nom, Toast.LENGTH_LONG).show();
                    }
                    Intent partage = new Intent(Intent.ACTION_SEND);
                    partage.setType(mime);
                    partage.putExtra(Intent.EXTRA_STREAM, uri);
                    partage.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
                    startActivity(Intent.createChooser(partage, "Envoyer " + nom));
                });
            } catch (Exception e) {
                erreur();
            }
        }

        @JavascriptInterface
        public void erreur() {
            runOnUiThread(() -> Toast.makeText(MainActivity.this,
                "Le fichier n'a pas pu être enregistré", Toast.LENGTH_LONG).show());
        }
    }

    /** Android 10 et plus : dossier Téléchargements sans permission. Avant : seulement le partage. */
    private boolean enregistrerDansTelechargements(byte[] contenu, String nom, String mime) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.Q) return false;
        try {
            ContentResolver resolveur = getContentResolver();
            ContentValues valeurs = new ContentValues();
            valeurs.put(MediaStore.Downloads.DISPLAY_NAME, nom);
            valeurs.put(MediaStore.Downloads.MIME_TYPE, mime);
            Uri uri = resolveur.insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, valeurs);
            if (uri == null) return false;
            try (OutputStream sortie = resolveur.openOutputStream(uri)) {
                if (sortie == null) return false;
                sortie.write(contenu);
            }
            return true;
        } catch (Exception e) {
            return false;
        }
    }
}
