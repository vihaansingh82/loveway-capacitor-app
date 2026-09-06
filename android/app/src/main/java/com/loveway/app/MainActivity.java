package com.loveway.app;

import android.Manifest;
import android.content.pm.PackageManager;
import android.os.Bundle;
import android.webkit.PermissionRequest;
import androidx.core.app.ActivityCompat;
import androidx.core.content.ContextCompat;
import com.getcapacitor.BridgeActivity;
import com.getcapacitor.BridgeWebChromeClient;
import java.util.ArrayList;

public class MainActivity extends BridgeActivity {
  private static final int CAMERA_MIC_PERMISSION_REQUEST = 9001;
  private PermissionRequest pendingWebPermissionRequest;

  @Override
  public void onCreate(Bundle savedInstanceState) {
    super.onCreate(savedInstanceState);
    // getUserMedia() (live camera + filters) WebView mein by default deny ho
    // jaati hai jab tak WebChromeClient khud onPermissionRequest handle na
    // kare — manifest mein CAMERA/RECORD_AUDIO declare karna kaafi nahi hai.
    // BridgeWebChromeClient extend karte hain taaki Capacitor ka apna file-
    // chooser/plugin handling (jo isi class par depend karta hai) bana rahe.
    this.bridge.getWebView().setWebChromeClient(new BridgeWebChromeClient(this.bridge) {
      @Override
      public void onPermissionRequest(final PermissionRequest request) {
        String[] resources = request.getResources();
        boolean needsCamera = false, needsMic = false;
        for (String r : resources) {
          if (PermissionRequest.RESOURCE_VIDEO_CAPTURE.equals(r)) needsCamera = true;
          if (PermissionRequest.RESOURCE_AUDIO_CAPTURE.equals(r)) needsMic = true;
        }
        if (!needsCamera && !needsMic) { super.onPermissionRequest(request); return; }

        boolean cameraOk = !needsCamera ||
          ContextCompat.checkSelfPermission(MainActivity.this, Manifest.permission.CAMERA)
            == PackageManager.PERMISSION_GRANTED;
        boolean micOk = !needsMic ||
          ContextCompat.checkSelfPermission(MainActivity.this, Manifest.permission.RECORD_AUDIO)
            == PackageManager.PERMISSION_GRANTED;

        if (cameraOk && micOk) { request.grant(resources); return; }

        pendingWebPermissionRequest = request;
        ArrayList<String> toAsk = new ArrayList<>();
        if (!cameraOk) toAsk.add(Manifest.permission.CAMERA);
        if (!micOk) toAsk.add(Manifest.permission.RECORD_AUDIO);
        ActivityCompat.requestPermissions(MainActivity.this, toAsk.toArray(new String[0]), CAMERA_MIC_PERMISSION_REQUEST);
      }
    });
  }

  @Override
  public void onRequestPermissionsResult(int requestCode, String[] permissions, int[] grantResults) {
    super.onRequestPermissionsResult(requestCode, permissions, grantResults);
    if (requestCode != CAMERA_MIC_PERMISSION_REQUEST || pendingWebPermissionRequest == null) return;

    PermissionRequest request = pendingWebPermissionRequest;
    pendingWebPermissionRequest = null;
    boolean allGranted = true;
    for (int r : grantResults) if (r != PackageManager.PERMISSION_GRANTED) allGranted = false;
    if (allGranted) request.grant(request.getResources());
    else request.deny();
  }
}
