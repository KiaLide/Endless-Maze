package com.kialide.endlessmaze;

import android.annotation.SuppressLint;
import android.app.Activity;
import android.graphics.Color;
import android.os.Bundle;
import android.view.DisplayCutout;
import android.view.View;
import android.widget.FrameLayout;
import android.view.WindowInsets;
import android.view.WindowInsetsController;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;

public class MainActivity extends Activity {
    private WebView web;

    @SuppressLint("SetJavaScriptEnabled")
    @SuppressWarnings("deprecation")
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        web = new WebView(this);
        web.setBackgroundColor(Color.parseColor("#0d0b14"));
        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);           // localStorage：保存最佳紀錄
        s.setMediaPlaybackRequiresUserGesture(false);
        s.setSupportZoom(false);
        // 從 file:// 載入時，讓畫布能讀取本地圖集像素（否則場景材質會被視為跨來源而全黑）
        s.setAllowFileAccess(true);
        s.setAllowFileAccessFromFileURLs(true);
        s.setAllowUniversalAccessFromFileURLs(true);
        web.setWebViewClient(new WebViewClient());
        web.setOverScrollMode(View.OVER_SCROLL_NEVER);
        // 外層容器：依前鏡頭（瀏海、挖孔）與狀態列預留上方空間，避免畫面被鏡頭擋住
        FrameLayout root = new FrameLayout(this);
        root.setBackgroundColor(Color.parseColor("#0b0910"));
        root.addView(web, new FrameLayout.LayoutParams(FrameLayout.LayoutParams.MATCH_PARENT, FrameLayout.LayoutParams.MATCH_PARENT));
        root.setOnApplyWindowInsetsListener((v, insets) -> {
            int l = 0, t = 0, r = 0, b = 0;
            if (android.os.Build.VERSION.SDK_INT >= 30) {
                android.graphics.Insets cut = insets.getInsetsIgnoringVisibility(WindowInsets.Type.displayCutout() | WindowInsets.Type.statusBars());
                android.graphics.Insets nav = insets.getInsetsIgnoringVisibility(WindowInsets.Type.navigationBars());
                l = cut.left; t = cut.top; r = cut.right; b = Math.max(cut.bottom, nav.bottom / 2);
            } else if (android.os.Build.VERSION.SDK_INT >= 28) {
                DisplayCutout c = insets.getDisplayCutout();
                if (c != null) { l = c.getSafeInsetLeft(); t = c.getSafeInsetTop(); r = c.getSafeInsetRight(); b = c.getSafeInsetBottom(); }
            }
            v.setPadding(l, t, r, b);
            return insets;
        });
        setContentView(root);
        web.loadUrl("file:///android_asset/index.html");
        hideSystemBars();
    }

    private void hideSystemBars() {
        if (android.os.Build.VERSION.SDK_INT >= 30) {
            WindowInsetsController c = getWindow().getInsetsController();
            if (c != null) {
                c.hide(WindowInsets.Type.statusBars() | WindowInsets.Type.navigationBars());
                c.setSystemBarsBehavior(WindowInsetsController.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE);
            }
        } else {
            web.setSystemUiVisibility(View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY
                    | View.SYSTEM_UI_FLAG_FULLSCREEN
                    | View.SYSTEM_UI_FLAG_HIDE_NAVIGATION
                    | View.SYSTEM_UI_FLAG_LAYOUT_STABLE);
        }
    }

    @Override
    public void onWindowFocusChanged(boolean hasFocus) {
        super.onWindowFocusChanged(hasFocus);
        if (hasFocus) hideSystemBars();
    }

    @Override
    protected void onPause() {
        super.onPause();
        web.onPause();
    }

    @Override
    protected void onResume() {
        super.onResume();
        web.onResume();
    }

    @Override
    @SuppressWarnings("deprecation")
    public void onBackPressed() {
        // 先讓遊戲處理返回鍵（例如關閉對話框），遊戲不處理才離開
        web.evaluateJavascript("window.onAndroidBack ? window.onAndroidBack() : false", value -> {
            if (!"true".equals(value)) MainActivity.super.onBackPressed();
        });
    }
}
