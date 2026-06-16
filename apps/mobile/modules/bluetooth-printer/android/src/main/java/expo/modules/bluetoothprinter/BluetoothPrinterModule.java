package expo.modules.bluetoothprinter;

import android.bluetooth.BluetoothAdapter;
import android.bluetooth.BluetoothDevice;
import android.bluetooth.BluetoothSocket;
import com.facebook.react.bridge.ReactApplicationContext;
import com.facebook.react.bridge.ReactContextBaseJavaModule;
import com.facebook.react.bridge.ReactMethod;
import com.facebook.react.bridge.Promise;
import com.facebook.react.bridge.WritableArray;
import com.facebook.react.bridge.WritableNativeArray;
import com.facebook.react.bridge.WritableMap;
import com.facebook.react.bridge.WritableNativeMap;
import com.facebook.react.bridge.ReadableArray;

import java.io.IOException;
import java.io.OutputStream;
import java.util.Set;
import java.util.UUID;

public class BluetoothPrinterModule extends ReactContextBaseJavaModule {
    private static final UUID SPP_UUID = UUID.fromString("00001101-0000-1000-8000-00805F9B34FB");
    private BluetoothSocket socket;
    private OutputStream outputStream;
    private BluetoothAdapter adapter;

    public BluetoothPrinterModule(ReactApplicationContext context) {
        super(context);
        adapter = BluetoothAdapter.getDefaultAdapter();
    }

    @Override
    public String getName() { return "BluetoothPrinter"; }

    @ReactMethod
    public void getDeviceList(Promise promise) {
        try {
            if (adapter == null) { promise.reject("NO_BT", "Bluetooth ni podprt"); return; }
            if (!adapter.isEnabled()) { promise.reject("BT_OFF", "Bluetooth ni vklopljen"); return; }
            Set<BluetoothDevice> devices = adapter.getBondedDevices();
            WritableArray arr = new WritableNativeArray();
            for (BluetoothDevice d : devices) {
                WritableMap map = new WritableNativeMap();
                map.putString("name", d.getName() != null ? d.getName() : "Neznana");
                map.putString("address", d.getAddress());
                arr.pushMap(map);
            }
            promise.resolve(arr);
        } catch (Exception e) {
            promise.reject("ERR", e.getMessage());
        }
    }

    @ReactMethod
    public void connect(String address, Promise promise) {
        new Thread(() -> {
            try {
                if (socket != null) { try { socket.close(); } catch (Exception ignored) {} }
                BluetoothDevice device = adapter.getRemoteDevice(address);
                socket = device.createRfcommSocketToServiceRecord(SPP_UUID);
                adapter.cancelDiscovery();
                socket.connect();
                outputStream = socket.getOutputStream();
                promise.resolve(null);
            } catch (Exception e) {
                promise.reject("CONNECT_ERR", e.getMessage());
            }
        }).start();
    }

    @ReactMethod
    public void disconnect(Promise promise) {
        try {
            if (outputStream != null) outputStream.close();
            if (socket != null) socket.close();
            outputStream = null;
            socket = null;
            promise.resolve(null);
        } catch (Exception e) {
            promise.reject("ERR", e.getMessage());
        }
    }

    @ReactMethod
    public void printText(String text, Promise promise) {
        new Thread(() -> {
            try {
                if (outputStream == null) { promise.reject("NOT_CONNECTED", "Tiskalnik ni povezan"); return; }
                String fixed = text
            .replace("\u0161", "s").replace("\u0160", "S")
            .replace("\u010d", "c").replace("\u010c", "C")
            .replace("\u017e", "z").replace("\u017d", "Z")
            .replace("\u0107", "c").replace("\u0106", "C")
            .replace("\u0111", "d").replace("\u0110", "D");
        outputStream.write(fixed.getBytes("ISO-8859-1"));
                outputStream.flush();
                // Feed papirja
                outputStream.write(new byte[]{0x0A, 0x0A, 0x0A});
                outputStream.flush();
                promise.resolve(null);
            } catch (Exception e) {
                promise.reject("PRINT_ERR", e.getMessage());
            }
        }).start();
    }

    @ReactMethod
    public void printQR(String data, int size, Promise promise) {
        new Thread(() -> {
            try {
                if (outputStream == null) { promise.reject("NOT_CONNECTED", "Tiskalnik ni povezan"); return; }
                byte[] dataBytes = data.getBytes("UTF-8");
                int dataLen = dataBytes.length;

                // ESC/POS QR code commands
                // 1. QR Model
                outputStream.write(new byte[]{0x1D, 0x28, 0x6B, 0x04, 0x00, 0x31, 0x41, 0x32, 0x00});
                // 2. QR Size
                outputStream.write(new byte[]{0x1D, 0x28, 0x6B, 0x03, 0x00, 0x31, 0x43, (byte)size});
                // 3. QR Error correction level (M)
                outputStream.write(new byte[]{0x1D, 0x28, 0x6B, 0x03, 0x00, 0x31, 0x45, 0x31});
                // 4. Store data
                int pL = (dataLen + 3) & 0xFF;
                int pH = ((dataLen + 3) >> 8) & 0xFF;
                outputStream.write(new byte[]{0x1D, 0x28, 0x6B, (byte)pL, (byte)pH, 0x31, 0x50, 0x30});
                outputStream.write(dataBytes);
                // 5. Print QR
                outputStream.write(new byte[]{0x1D, 0x28, 0x6B, 0x03, 0x00, 0x31, 0x51, 0x30});
                outputStream.flush();
                promise.resolve(null);
            } catch (Exception e) {
                promise.reject("QR_ERR", e.getMessage());
            }
        }).start();
    }

    @ReactMethod
    public void printBytes(ReadableArray bytes, Promise promise) {
        new Thread(() -> {
            try {
                if (outputStream == null) { promise.reject("NOT_CONNECTED", "Tiskalnik ni povezan"); return; }
                byte[] data = new byte[bytes.size()];
                for (int i = 0; i < bytes.size(); i++) data[i] = (byte) bytes.getInt(i);
                outputStream.write(data);
                outputStream.flush();
                promise.resolve(null);
            } catch (Exception e) {
                promise.reject("PRINT_ERR", e.getMessage());
            }
        }).start();
    }
}
