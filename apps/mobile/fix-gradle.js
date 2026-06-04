const fs = require('fs');
const path = require('path');

const gradlePath = path.join(__dirname, 'node_modules/@vardrz/react-native-bluetooth-escpos-printer/android/build.gradle');

if (fs.existsSync(gradlePath)) {
  let content = fs.readFileSync(gradlePath, 'utf8');
  content = content.replace(/jcenter\s*\{[^}]*\}/g, 'mavenCentral()');
  content = content.replace(/jcenter\(\)/g, 'mavenCentral()');
  content = content.replace("classpath 'com.android.tools.build:gradle:3.1.4'", "classpath 'com.android.tools.build:gradle:8.0.0'");
  fs.writeFileSync(gradlePath, content);
  console.log('Gradle patched successfully');
} else {
  console.log('Gradle file not found, skipping patch');
}
