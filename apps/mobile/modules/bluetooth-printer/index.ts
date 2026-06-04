import { NativeModules } from 'react-native'

const { BluetoothPrinter } = NativeModules

export default {
  async getDeviceList(): Promise<Array<{ name: string; address: string }>> {
    return BluetoothPrinter.getDeviceList()
  },
  async connect(address: string): Promise<void> {
    return BluetoothPrinter.connect(address)
  },
  async disconnect(): Promise<void> {
    return BluetoothPrinter.disconnect()
  },
  async printText(text: string): Promise<void> {
    return BluetoothPrinter.printText(text)
  },
  async printBytes(bytes: number[]): Promise<void> {
    return BluetoothPrinter.printBytes(bytes)
  },
}
