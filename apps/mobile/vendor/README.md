# React Native Bluetooth ESC/POS & TSC Printer

[![GitHub license](https://img.shields.io/badge/license-MIT-blue.svg)](https://raw.githubusercontent.com/vardrz/react-native-bluetooth-escpos-printer/master/LICENSE) [![npm version](https://badge.fury.io/js/@vardrz%2Freact-native-bluetooth-escpos-printer.svg)](https://badge.fury.io/js/@vardrz%2Freact-native-bluetooth-escpos-printer)

React Native plugin for Bluetooth ESC/POS & TSC printers.

> 💡 Still under development.  
> ✅ Currently supports **Android**, **iOS support** planned.

Any questions or bugs? Please open an [issue](https://github.com/vardrz/react-native-bluetooth-escpos-printer/issues).

---

## 🧩 Acknowledgments

This project is a continuation of the excellent work started by [**Janus J K Lu**](https://github.com/januslo/react-native-bluetooth-escpos-printer) and later improved by [**Ccdilan**](https://github.com/ccdilan/react-native-bluetooth-escpos-printer).
This fork by [**Farid Fatkhurrozak (Vardrz)**](https://github.com/vardrz/react-native-bluetooth-escpos-printer) builds upon Ccdilan’s version — adding **TypeScript support**, **minor native fixes**, and **extra print options**.

Special thanks to both Janus and Ccdilan — their contributions laid the foundation  
for this version to exist and continue evolving.

---

## 📦 Installation

**Install via NPM:**
```bash
npm install @vardrz/react-native-bluetooth-escpos-printer --save
```

**Or install via GitHub:**
```bash
npm install https://github.com/vardrz/react-native-bluetooth-escpos-printer.git --save
```

---

## 🚀 Usage

### Import module
```js
import {
  BluetoothManager,
  BluetoothEscposPrinter,
  BluetoothTscPrinter
} from '@vardrz/react-native-bluetooth-escpos-printer';
```

---

## 🔧 BluetoothManager

Manages Bluetooth service: status check, enable/disable, scan, connect/unpair.

### ✅ isBluetoothEnabled
Check whether Bluetooth is enabled.
```js
BluetoothManager.isBluetoothEnabled().then(enabled => {
  alert(enabled); // true / false
}, err => alert(err));
```

### ✅ enableBluetooth *(Android only)*
Enable Bluetooth service and return paired devices.
```js
BluetoothManager.enableBluetooth().then(r => {
  const paired = r.map(item => JSON.parse(item));
  console.log('Paired devices:', paired);
});
```

### ✅ disableBluetooth *(Android only)*
Disable Bluetooth service.
```js
BluetoothManager.disableBluetooth().then(() => {
  console.log('Bluetooth disabled');
});
```

### ✅ scanDevices
Scans nearby devices and returns paired/found results.
```js
BluetoothManager.scanDevices().then(s => {
  const result = JSON.parse(s);
  console.log(result.paired, result.found);
});
```

### ✅ connect / unpair
```js
BluetoothManager.connect(device.address)
  .then(() => console.log('Connected!'))
  .catch(e => alert(e));

BluetoothManager.unpair(device.address)
  .then(() => console.log('Unpaired'))
  .catch(e => alert(e));
```

### 📡 Events

| Event Key | Description |
|------------|--------------|
| `EVENT_DEVICE_ALREADY_PAIRED` | Emits paired devices array |
| `EVENT_DEVICE_DISCOVER_DONE` | Emits when scanning completes |
| `EVENT_DEVICE_FOUND` | Emits when new device found |
| `EVENT_CONNECTION_LOST` | Emits when connection lost |
| `EVENT_UNABLE_CONNECT` | Emits when connection fails |
| `EVENT_CONNECTED` | Emits when connected |
| `EVENT_BLUETOOTH_NOT_SUPPORT` | Device does not support BT (Android only) |

---

## 🖨️ BluetoothTscPrinter (Label Printer)

Used for **label** printing.

### ✅ printLabel(options)
```js
BluetoothTscPrinter.printLabel(options)
  .then(() => console.log('Label printed'))
  .catch(err => console.error(err));
```

#### Example Options
```js
const options = {
  width: 40,
  height: 30,
  gap: 20,
  direction: BluetoothTscPrinter.DIRECTION.FORWARD,
  reference: [0, 0],
  tear: BluetoothTscPrinter.TEAR.ON,
  sound: 0,
  text: [
    {
      text: 'Sample Text',
      x: 20, y: 0,
      fonttype: BluetoothTscPrinter.FONTTYPE.SIMPLIFIED_CHINESE,
      rotation: BluetoothTscPrinter.ROTATION.ROTATION_0,
      xscal: BluetoothTscPrinter.FONTMUL.MUL_1,
      yscal: BluetoothTscPrinter.FONTMUL.MUL_1
    }
  ],
  qrcode: [
    { x: 20, y: 96, level: BluetoothTscPrinter.EEC.LEVEL_L, width: 3, code: 'show me the money' }
  ],
  barcode: [
    { x: 120, y: 96, type: BluetoothTscPrinter.BARCODETYPE.CODE128, height: 40, readable: 1, code: '1234567890' }
  ],
  image: [
    { x: 160, y: 160, mode: BluetoothTscPrinter.BITMAP_MODE.OVERWRITE, width: 60, image: base64Image }
  ]
};
```

---

## 🧾 BluetoothEscposPrinter (Receipt Printer)

Follows ESC/POS command set for text & image printing.

### ✅ printerInit
Initialize printer.

### ✅ printText(text, options)
Prints text with options:
```js
BluetoothEscposPrinter.printText("Hello World\n", {
  encoding: 'GBK',
  widthtimes: 1,
  heigthtimes: 1,
  fonttype: 0,
  cut: true
});
```

### ✅ printPic(base64, options)
Prints image (base64 encoded).

**Options:**

| Key | Type | Description |
|-----|------|--------------|
| `width` | int | Target width (dots) |
| `left` | int | Left padding (ignored if `center` true) |
| `center` | bool | Center horizontally |
| `autoCut` | bool | Auto-cut after print (default `true`) |
| `paperSize` | int | Paper width (58 / 80 mm) |

**Example:**
```js
BluetoothEscposPrinter.printPic(base64Image, {
  width: 384,
  center: true,
  paperSize: 80,
  autoCut: false
});
```

### ✅ printColumn
Print columns (table-style layout).
```js
await BluetoothEscposPrinter.printColumn(
  [12, 6, 6, 8],
  [BluetoothEscposPrinter.ALIGN.LEFT, BluetoothEscposPrinter.ALIGN.CENTER, BluetoothEscposPrinter.ALIGN.CENTER, BluetoothEscposPrinter.ALIGN.RIGHT],
  ['Item', 'Qty', 'Price', 'Total'],
  {}
);
```

---

### 🧾 Full Example: Print a Receipt
```js
await BluetoothEscposPrinter.printerAlign(BluetoothEscposPrinter.ALIGN.CENTER);
await BluetoothEscposPrinter.printText("My Store\n\r", { widthtimes: 3, heigthtimes: 3 });
await BluetoothEscposPrinter.printText("Sales Receipt\n\r", {});
await BluetoothEscposPrinter.printerAlign(BluetoothEscposPrinter.ALIGN.LEFT);
await BluetoothEscposPrinter.printText("Customer: Retail\n\r", {});
await BluetoothEscposPrinter.printText("Invoice: INV20251014\n\r", {});
await BluetoothEscposPrinter.printText("--------------------------------\n\r", {});
let columnWidths = [12, 6, 6, 8];
await BluetoothEscposPrinter.printColumn(columnWidths,
  [0, 1, 1, 2],
  ['Product', 'Qty', 'Price', 'Total'],
  {}
);
await BluetoothEscposPrinter.printText("--------------------------------\n\r", {});
await BluetoothEscposPrinter.printText("Total: $64.00\n\r", {});
await BluetoothEscposPrinter.printText("Thank you!\n\r\n\r", {});
```

---

### 💡 Open Drawer
```js
BluetoothEscposPrinter.openDrawer(0, 250, 250);
```

---

## 🔗 References
- [Original repo – januslo/react-native-bluetooth-escpos-printer](https://github.com/januslo/react-native-bluetooth-escpos-printer)
- [Ccdilan fork – @ccdilan/react-native-bluetooth-escpos-printer](https://github.com/ccdilan/react-native-bluetooth-escpos-printer)
- [This fork – @vardrz/react-native-bluetooth-escpos-printer](https://github.com/vardrz/react-native-bluetooth-escpos-printer)
