import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";

// TODO: 請將你在 Firebase 控制台取得的 config 貼在下方
// 路徑：Firebase Console > 專案設定 > 一般 > 你的應用程式 > SDK 設定與配置
const firebaseConfig = {
  apiKey: "YOUR_API_KEY",
  authDomain: "YOUR_AUTH_DOMAIN",
  projectId: "YOUR_PROJECT_ID",
  storageBucket: "YOUR_STORAGE_BUCKET",
  messagingSenderId: "YOUR_MESSAGING_SENDER_ID",
  appId: "YOUR_APP_ID"
};

// 初始化 Firebase
const app = initializeApp(firebaseConfig);

// 初始化 Firestore 資料庫
export const db = getFirestore(app);
