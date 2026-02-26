import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";

// TODO: 請將你在 Firebase 控制台取得的 config 貼在下方
// 路徑：Firebase Console > 專案設定 > 一般 > 你的應用程式 > SDK 設定與配置
// --- 這是正確的網頁版 SDK 設定方式 ---
const firebaseConfig = {
  apiKey: "AIzaSyCkvR46qY_TToE5WyfYk2KrpyQTlKLJcqw",
  authDomain: "cosmed-shcedule.firebaseapp.com",
  projectId: "cosmed-shcedule",
  storageBucket: "cosmed-shcedule.firebasestorage.app",
  messagingSenderId: "189637362701",
  appId: "1:189637362701:web:607f61ece812934dadc144",
  measurementId: "G-EXSBFEZ9GC"
};

// 初始化 Firebase
const app = initializeApp(firebaseConfig);

// 初始化 Firestore 資料庫
export const db = getFirestore(app);
