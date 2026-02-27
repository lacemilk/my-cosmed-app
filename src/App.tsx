/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useMemo } from 'react';
import { db } from './firebase';
import { collection, doc, getDoc, getDocs, setDoc, deleteDoc, onSnapshot, writeBatch } from 'firebase/firestore';
import { 
  Calendar as CalendarIcon, Users, Settings, Clock, CheckCircle2, AlertCircle, 
  RefreshCw, Edit3, Plus, Trash2, X, DollarSign, ChevronLeft, ChevronRight,
  History, CalendarDays
} from 'lucide-react';
import { 
  format, addDays, startOfWeek, endOfWeek, eachDayOfInterval, 
  isSameDay, isToday, startOfMonth, endOfMonth, addMonths, subMonths,
  isWeekend, parseISO, subDays
} from 'date-fns';
import { zhTW } from 'date-fns/locale';
import html2canvas from 'html2canvas';

// --- 預設常數與資料 ---
const WEEKDAYS = ['一', '二', '三', '四', '五', '六', '日'];

const COLORS = [
  'bg-[#E8F5E9] text-[#2E7D32] border-[#C8E6C9]', // Soft Green
  'bg-[#E8EAF6] text-[#283593] border-[#C5CAE9]', // Soft Blue
  'bg-[#FFF3E0] text-[#EF6C00] border-[#FFE0B2]', // Soft Orange
  'bg-[#FCE4EC] text-[#C2185B] border-[#F8BBD0]', // Soft Pink
  'bg-[#F3E5F5] text-[#7B1FA2] border-[#E1BEE7]', // Soft Purple
  'bg-[#E0F7FA] text-[#00838F] border-[#B2EBF2]', // Soft Cyan
  'bg-[#EFEBE9] text-[#4E342E] border-[#D7CCC8]', // Soft Brown
];

// 台灣國定假日 (2026 範例)
const TAIWAN_HOLIDAYS: Record<string, string> = {
  '2026-01-01': '元旦',
  '2026-02-16': '農曆除夕',
  '2026-02-17': '春節',
  '2026-02-18': '春節',
  '2026-02-19': '春節',
  '2026-02-20': '春節',
  '2026-02-21': '春節',
  '2026-02-28': '和平紀念日',
  '2026-04-04': '兒童節/清明節',
  '2026-05-01': '勞動節',
  '2026-06-19': '端午節',
  '2026-09-25': '中秋節',
  '2026-10-10': '國慶日',
};

const OFF_SHIFT = { id: 'OFF', name: '休假', time: '', hours: 0, type: 'ALL', color: 'bg-stone-100 text-stone-500 border-stone-200' };

const INITIAL_SHIFTS = [
  { id: 'S1', name: '早班(值班)', time: '09:00-17:00', hours: 8, type: 'FT', required: [1, 1, 1, 1, 1, 1, 1], color: COLORS[0] },
  { id: 'S2', name: '晚班(值班)', time: '15:00-23:00', hours: 8, type: 'FT', required: [1, 1, 1, 1, 1, 1, 1], color: COLORS[1] },
  { id: 'S3', name: '早班', time: '09:00-16:00', hours: 7, type: 'PT', required: [1, 1, 1, 1, 1, 1, 1], color: COLORS[2] },
  { id: 'S4', name: '晚班', time: '17:00-22:00', hours: 5, type: 'PT', required: [2, 2, 2, 2, 3, 3, 3], color: COLORS[3] },
  { id: 'M1', name: '開會', time: '10:00-12:00', hours: 0, type: 'OTHER', required: [0, 0, 0, 0, 0, 0, 0], color: 'bg-stone-200 text-stone-700 border-stone-300' },
];

const INITIAL_EMPLOYEES = [
  { id: '1', name: 'S M', type: 'FT', preferredOff: [], maxHours: 40, shiftPreference: 'NONE', classSchedule: [] }, 
  { id: '2', name: 'R', type: 'FT', preferredOff: [5], maxHours: 40, shiftPreference: 'NONE', classSchedule: [] }, 
  { id: '3', name: '嘉祐', type: 'FT', preferredOff: [], maxHours: 40, shiftPreference: 'NONE', classSchedule: [] }, 
  { id: '4', name: '育榕', type: 'FT', preferredOff: [2, 6], maxHours: 40, shiftPreference: 'NONE', classSchedule: [] },
  { id: '5', name: '冠慈', type: 'PPT', preferredOff: [1, 5, 6], maxHours: 30, shiftPreference: 'MORNING', classSchedule: [] },
  { id: '6', name: '千育', type: 'PT', preferredOff: [3, 6], maxHours: 24, shiftPreference: 'EVENING', classSchedule: [] },
  { id: '7', name: '家瑩', type: 'PT', preferredOff: [1, 2, 3, 4, 5], maxHours: 24, shiftPreference: 'EVENING', classSchedule: [] },
  { id: '8', name: '梓瑜', type: 'PT', preferredOff: [], maxHours: 24, shiftPreference: 'MORNING', classSchedule: [] },
  { id: '9', name: '秉澤', type: 'PT', preferredOff: [2, 3], maxHours: 24, shiftPreference: 'EVENING', classSchedule: [] },
  { id: '10', name: '蒨昀', type: 'PT', preferredOff: [], maxHours: 24, shiftPreference: 'EVENING', classSchedule: [] },
  { id: '11', name: '詩宥', type: 'PT', preferredOff: [0, 1], maxHours: 24, shiftPreference: 'EVENING', classSchedule: [] },
];

const INITIAL_BUDGET = {
  daily: [40, 40, 40, 40, 48, 56, 56],
  weekly: 320
};

export default function App() {
  const [activeTab, setActiveTab] = useState('schedule');
  const [viewMode, setViewMode] = useState<'week' | 'month'>('week');
  const [currentDate, setCurrentDate] = useState(new Date());
  const [employees, setEmployees] = useState(INITIAL_EMPLOYEES);
  const [shifts, setShifts] = useState(INITIAL_SHIFTS);
  const [storeBudget, setStoreBudget] = useState(INITIAL_BUDGET);
  // schedule[dateString][empId] = { shiftId, customTime, customHours }
  const [schedule, setSchedule] = useState<Record<string, Record<string, any>>>({}); 
  const [complianceIssues, setComplianceIssues] = useState<string[]>([]);
  const [selectedCell, setSelectedCell] = useState<{ empId: string, date: string } | null>(null);
  const [editingEmp, setEditingEmp] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved'>('idle');
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);

  // === 離開提示 ===
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (hasUnsavedChanges) {
        e.preventDefault();
        e.returnValue = '您有尚未儲存的變更，確定要離開嗎？';
        return e.returnValue;
      }
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [hasUnsavedChanges]);

  // === Firebase 資料同步 ===
  
  // 1. 初始化讀取資料
  useEffect(() => {
    setIsLoading(true);
    
    // 監聽員工
    const unsubEmployees = onSnapshot(collection(db, 'employees'), (snapshot) => {
      const empList = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
      if (empList.length > 0) setEmployees(empList as any);
    });

    // 監聽班別
    const unsubShifts = onSnapshot(collection(db, 'shifts'), (snapshot) => {
      const shiftList = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
      if (shiftList.length > 0) setShifts(shiftList as any);
    });

    // 監聽設定
    const unsubSettings = onSnapshot(doc(db, 'settings', 'storeConfig'), (doc) => {
      if (doc.exists()) {
        setStoreBudget(doc.data() as any);
      }
    });

    // 監聽排班紀錄
    const unsubSchedule = onSnapshot(collection(db, 'schedules'), (snapshot) => {
      const newSchedule: Record<string, Record<string, any>> = {};
      snapshot.forEach(doc => {
        newSchedule[doc.id] = doc.data();
      });
      setSchedule(newSchedule);
      setIsLoading(false);
    });

    return () => {
      unsubEmployees();
      unsubShifts();
      unsubSettings();
      unsubSchedule();
    };
  }, []);

  // 2. 儲存員工資料
  const handleSaveEmployee = async () => {
    if (!editingEmp) return;
    if (!editingEmp.name.trim()) return;
    
    const { isNew, ...empData } = editingEmp;
    console.log("Saving employee:", empData);
    try {
      await setDoc(doc(db, 'employees', empData.id), empData);
      setEmployees(prev => {
        if (isNew) return [...prev, empData];
        return prev.map(e => e.id === empData.id ? empData : e);
      });
      setEditingEmp(null);
    } catch (error) {
      console.error("Save Employee Error:", error);
      alert("儲存失敗，請檢查 Firebase 權限或網路連線");
    }
  };

  const handleDeleteEmployee = async (id: string) => {
    if (!confirm('確定要刪除此員工嗎？')) return;
    try {
      await deleteDoc(doc(db, 'employees', id));
      setEmployees(employees.filter(e => e.id !== id));
      setEditingEmp(null);
    } catch (error) {
      alert("刪除失敗");
    }
  };

  // 3. 儲存班表
  const saveScheduleToFirebase = async (newSched: any, silent = true) => {
    if (!silent) setSaveStatus('saving');
    
    try {
      const batch = writeBatch(db);
      // 為了效能，我們僅儲存當前視圖週期的日期，或是傳入的特定變動
      // 這裡我們抓取 newSched 中所有的 key (日期)
      const dates = Object.keys(newSched);
      
      // Firestore batch 限制 500 筆，通常一週只有 7 筆，一個月 31 筆，遠低於限制
      dates.forEach(dateStr => {
        const docRef = doc(db, 'schedules', dateStr);
        batch.set(docRef, newSched[dateStr]);
      });
      
      await batch.commit();
      
      if (!silent) {
        setSaveStatus('saved');
        setHasUnsavedChanges(false);
      }
      console.log("Schedule saved successfully with batch");
    } catch (error) {
      console.error("Schedule Save Error:", error);
      if (!silent) {
        setSaveStatus('idle');
        alert("儲存失敗，請檢查網路連線");
      }
    }
  };

  // 4. 儲存設定
  useEffect(() => {
    if (isLoading) return;
    const saveSettings = async () => {
      await setDoc(doc(db, 'settings', 'storeConfig'), storeBudget);
    };
    saveSettings();
  }, [storeBudget]);

  useEffect(() => {
    if (isLoading) return;
    const saveShifts = async () => {
      for (const shift of shifts) {
        await setDoc(doc(db, 'shifts', shift.id), shift);
      }
    };
    saveShifts();
  }, [shifts]);

  // 5. 匯出圖片
  const handleExportImage = async () => {
    const element = document.getElementById('schedule-table');
    if (!element) return;
    
    const loadingDiv = document.createElement('div');
    loadingDiv.className = "fixed inset-0 z-[100] flex items-center justify-center bg-black/40 text-white font-medium backdrop-blur-sm";
    loadingDiv.innerHTML = "圖片產生中...";
    document.body.appendChild(loadingDiv);

    try {
      const canvas = await html2canvas(element, {
        backgroundColor: '#F7F7F5',
        scale: 1.2, // 降低倍率以加速並減小檔案體積
        logging: false,
        useCORS: true,
        onclone: (clonedDoc) => {
          const el = clonedDoc.getElementById('schedule-table');
          if (el) {
            el.style.overflow = 'visible';
            el.style.width = 'auto';
            el.style.padding = '4px';
          }
        }
      });
      
      const dataUrl = canvas.toDataURL('image/png');
      const link = document.createElement('a');
      link.download = `康是美班表_${format(currentDate, 'yyyy-MM-dd')}.png`;
      link.href = dataUrl;
      link.click();
    } catch (error) {
      console.error("Export Error:", error);
      alert("匯出圖片失敗，請嘗試使用電腦版匯出。");
    } finally {
      if (document.body.contains(loadingDiv)) {
        document.body.removeChild(loadingDiv);
      }
    }
  };

  useEffect(() => {
    // 僅在切換日期時，如果該週完全沒有任何資料，才提醒使用者可以點擊智能排班
    // 不再自動執行，避免覆蓋已有的手動調整
  }, [currentDate]);

  // --- 排班與法規邏輯 ---
  const checkCompliance = (currentSchedule: any, targetDate: Date) => {
    let issues: string[] = [];
    const weekStart = startOfWeek(targetDate, { weekStartsOn: 1 });
    const weekEnd = endOfWeek(targetDate, { weekStartsOn: 1 });
    const weekDays = eachDayOfInterval({ start: weekStart, end: weekEnd });

    // 1. 一例一休 (針對正職)
    employees.forEach(emp => {
      if (emp.type === 'FT') {
        let offDays = 0;
        weekDays.forEach(d => {
          const dateStr = format(d, 'yyyy-MM-dd');
          const cell = currentSchedule[dateStr]?.[emp.id];
          if (!cell || cell.shiftId === 'OFF') offDays++;
        });
        if (offDays < 2) {
          issues.push(`${emp.name} 休息日不足2天 (違反一例一休)`);
        }
      }
    });

    // 2. 值班人員涵蓋率
    weekDays.forEach((day) => {
      const dateStr = format(day, 'yyyy-MM-dd');
      const dayIndex = (day.getDay() + 6) % 7; // 0=Mon, 6=Sun
      let hasMorningDuty = false;
      let hasEveningDuty = false;
      let hasAnyShift = false;

      let requiredCountToday = 0;
      shifts.forEach(s => { requiredCountToday += s.required[dayIndex]; });

      if (requiredCountToday > 0) {
        employees.forEach(emp => {
          const cellObj = currentSchedule[dateStr]?.[emp.id];
          if (cellObj && cellObj.shiftId && cellObj.shiftId !== 'OFF') {
            const shiftData = shifts.find(s => s.id === cellObj.shiftId);
            if (shiftData && shiftData.type !== 'OTHER') {
              hasAnyShift = true;
              if (emp.type === 'FT' || emp.type === 'PPT') {
                const timeStr = cellObj.customTime || shiftData.time;
                if (timeStr) {
                  const startHour = parseInt(timeStr.split('-')[0], 10);
                  const endHour = parseInt(timeStr.split('-')[1], 10);
                  if (startHour <= 14) hasMorningDuty = true; 
                  if (endHour >= 18) hasEveningDuty = true;   
                }
              }
            }
          }
        });

        if (hasAnyShift) {
          const dayName = format(day, 'EEEE', { locale: zhTW });
          if (!hasMorningDuty) issues.push(`${dayName} 缺乏早班值班人員 (需安排正職或PPT)`);
          if (!hasEveningDuty) issues.push(`${dayName} 缺乏晚班值班人員 (需安排正職或PPT)`);
        }
      }
    });

    // 3. 22:00-23:00 值班需求 (至少1值班+1任意)
    weekDays.forEach((day) => {
      const dateStr = format(day, 'yyyy-MM-dd');
      let dutyCount = 0;
      let totalCount = 0;

      employees.forEach(emp => {
        const cell = currentSchedule[dateStr]?.[emp.id];
        if (cell && cell.shiftId !== 'OFF') {
          const shiftData = shifts.find(s => s.id === cell.shiftId);
          const timeStr = cell.customTime || shiftData?.time;
          if (timeStr) {
            const [start, end] = timeStr.split('-').map(t => parseInt(t.split(':')[0], 10));
            // 檢查是否涵蓋 22:00-23:00
            if (start <= 22 && end >= 23) {
              totalCount++;
              if (emp.type === 'FT' || emp.type === 'PPT') dutyCount++;
            }
          }
        }
      });

      if (totalCount > 0) {
        if (dutyCount < 1) issues.push(`${format(day, 'MM/dd')} 22:00-23:00 缺乏值班人員`);
        if (totalCount < 2) issues.push(`${format(day, 'MM/dd')} 22:00-23:00 總人數不足2人`);
      }
    });

    // 4. 11小時休息時間
    employees.forEach(emp => {
      weekDays.forEach(day => {
        const dateStr = format(day, 'yyyy-MM-dd');
        const prevDateStr = format(subDays(day, 1), 'yyyy-MM-dd');
        const currentCell = currentSchedule[dateStr]?.[emp.id];
        const prevCell = currentSchedule[prevDateStr]?.[emp.id];

        if (currentCell && currentCell.shiftId !== 'OFF' && prevCell && prevCell.shiftId !== 'OFF') {
          const currentShift = shifts.find(s => s.id === currentCell.shiftId);
          const prevShift = shifts.find(s => s.id === prevCell.shiftId);
          
          const currentTime = currentCell.customTime || currentShift?.time;
          const prevTime = prevCell.customTime || prevShift?.time;

          if (currentTime && prevTime) {
            const currentStart = parseInt(currentTime.split('-')[0].split(':')[0], 10);
            const prevEnd = parseInt(prevTime.split('-')[1].split(':')[0], 10);
            
            // 假設跨日的情況，prevEnd 到 currentStart 的距離
            const restHours = (24 - prevEnd) + currentStart;
            if (restHours < 11) {
              issues.push(`${emp.name} 在 ${format(day, 'MM/dd')} 休息時間不足 11 小時 (僅 ${restHours}h)`);
            }
          }
        }
      });
    });

    setComplianceIssues(issues);
  };

  const handleAutoSchedule = (targetDate: Date) => {
    const weekStart = startOfWeek(targetDate, { weekStartsOn: 1 });
    const weekEnd = endOfWeek(targetDate, { weekStartsOn: 1 });
    const weekDays = eachDayOfInterval({ start: weekStart, end: weekEnd });
    
    let newSchedule = { ...schedule };
    
    // 初始化當週
    weekDays.forEach(d => {
      const dateStr = format(d, 'yyyy-MM-dd');
      if (!newSchedule[dateStr]) newSchedule[dateStr] = {};
      employees.forEach(emp => {
        newSchedule[dateStr][emp.id] = { shiftId: 'OFF', customTime: '', customHours: 0 };
      });
    });

    const getWorkedHours = (empId: string) => {
      return weekDays.reduce((sum, d) => {
        const dateStr = format(d, 'yyyy-MM-dd');
        return sum + (newSchedule[dateStr]?.[empId]?.customHours || 0);
      }, 0);
    };

    weekDays.forEach((day) => {
      const dateStr = format(day, 'yyyy-MM-dd');
      const dayIndex = (day.getDay() + 6) % 7;
      let dailyShifts: any[] = [];
      
      shifts.forEach(s => {
        if (s.type === 'OTHER') return;
        const reqCount = s.required[dayIndex] || 0;
        for(let i=0; i < reqCount; i++) {
          const startHour = parseInt(s.time.split('-')[0], 10);
          dailyShifts.push({
            id: s.id,
            type: s.type, 
            isMorning: startHour <= 14,
            original: s
          });
        }
      });

      dailyShifts.sort((a, b) => {
         if (a.isMorning && !b.isMorning) return -1;
         if (!a.isMorning && b.isMorning) return 1;
         if (a.type === 'FT' && b.type === 'PT') return -1;
         if (a.type === 'PT' && b.type === 'FT') return 1;
         return 0;
      });

      let assignedEmpIds = new Set(); 

      dailyShifts.forEach(shift => {
        let bestEmp: any = null;
        let bestScore = -Infinity;

        employees.forEach(emp => {
          if (assignedEmpIds.has(emp.id)) return;
          if (emp.preferredOff.includes(dayIndex)) return;
          
          if (emp.type === 'FT') {
             const daysWorked = weekDays.filter(d => {
               const ds = format(d, 'yyyy-MM-dd');
               return newSchedule[ds]?.[emp.id]?.shiftId !== 'OFF';
             }).length;
             if (daysWorked >= 5) return;
          }
          
          if (shift.type === 'FT' && emp.type === 'PT') return;

          // 11小時休息檢查
          const prevDateStr = format(subDays(day, 1), 'yyyy-MM-dd');
          const prevCell = newSchedule[prevDateStr]?.[emp.id];
          if (prevCell && prevCell.shiftId !== 'OFF') {
            const prevShift = shifts.find(s => s.id === prevCell.shiftId);
            const prevTime = prevCell.customTime || prevShift?.time;
            if (prevTime) {
              const prevEnd = parseInt(prevTime.split('-')[1].split(':')[0], 10);
              const currentStart = parseInt(shift.original.time.split('-')[0].split(':')[0], 10);
              const restHours = (24 - prevEnd) + currentStart;
              if (restHours < 11) return; // 不符合休息時間，跳過
            }
          }

          // 課表檢查 (PT/PPT)
          if (emp.classSchedule && emp.classSchedule.length > 0) {
            const todayClasses = emp.classSchedule.filter((c: any) => c.day === dayIndex);
            const shiftStart = parseInt(shift.original.time.split('-')[0].split(':')[0], 10);
            const shiftEnd = parseInt(shift.original.time.split('-')[1].split(':')[0], 10);
            
            const hasOverlap = todayClasses.some((c: any) => {
              const cStart = parseInt(c.startTime.split(':')[0], 10);
              const cEnd = parseInt(c.endTime.split(':')[0], 10);
              return (shiftStart < cEnd && shiftEnd > cStart);
            });
            if (hasOverlap) return; // 與課表衝突，跳過
          }

          let score = 0;
          if (shift.isMorning) {
              if (shift.type === 'FT') {
                  // 值班優先給正職 (FT)，其次才是 PPT
                  if (emp.type === 'FT') score += 2000;
                  else if (emp.type === 'PPT') score += 1000;
              } else {
                  // 非值班（支援）優先給 PT，其次 PPT，最後才是 FT (讓大家都有班上)
                  if (emp.type === 'PT') score += 1000;
                  else if (emp.type === 'PPT') score += 500;
                  else if (emp.type === 'FT') score += 200;
              }
          } else {
              if (shift.type === 'FT') {
                  // 值班優先給正職 (FT)，其次才是 PPT
                  if (emp.type === 'FT') score += 2000;
                  else if (emp.type === 'PPT') score += 1000;
              } else {
                  // 非值班（支援）優先給 PT，其次 PPT，最後才是 FT
                  if (emp.type === 'PT') score += 1000;
                  else if (emp.type === 'PPT') score += 500;
                  else if (emp.type === 'FT') score += 200;
              }
          }

          if (shift.isMorning) {
              if (emp.shiftPreference === 'MORNING') score += 100;
          } else {
              if (emp.shiftPreference === 'EVENING') score += 100;
          }

          score -= getWorkedHours(emp.id);

          if (score > bestScore) {
            bestScore = score;
            bestEmp = emp;
          }
        });

        if (bestEmp && bestScore > -9000) {
          newSchedule[dateStr][bestEmp.id] = {
             shiftId: shift.id,
             customTime: shift.original.time,
             customHours: shift.original.hours
          };
          assignedEmpIds.add(bestEmp.id);
        }
      });
    });

    setSchedule(newSchedule);
    setHasUnsavedChanges(true);
    saveScheduleToFirebase(newSchedule);
    checkCompliance(newSchedule, targetDate);
    setSelectedCell(null);
  };

  const updateCellShift = (empId: string, dateStr: string, shiftId: string) => {
    const sData = shiftId === 'OFF' ? OFF_SHIFT : shifts.find(s => s.id === shiftId);
    const newSchedule = {
      ...schedule,
      [dateStr]: {
        ...schedule[dateStr],
        [empId]: {
          shiftId,
          customTime: sData?.time || '',
          customHours: sData?.hours || 0
        }
      }
    };
    setSchedule(newSchedule);
    setHasUnsavedChanges(true);
    saveScheduleToFirebase(newSchedule);
    checkCompliance(newSchedule, currentDate);
    setSelectedCell(null); // 選完後自動關閉選單
  };

  const updateCellCustom = (empId: string, dateStr: string, updates: any) => {
    const newSchedule = {
      ...schedule,
      [dateStr]: {
        ...schedule[dateStr],
        [empId]: {
          ...(schedule[dateStr]?.[empId] || {}),
          ...updates
        }
      }
    };
    setSchedule(newSchedule);
    setHasUnsavedChanges(true);
    // 這裡先不即時存 Firebase，避免打字卡頓，改由關閉選單時統一存檔
    checkCompliance(newSchedule, currentDate);
  };

  const calculateTotalHours = (empId: string, targetDate: Date) => {
    const weekStart = startOfWeek(targetDate, { weekStartsOn: 1 });
    const weekEnd = endOfWeek(targetDate, { weekStartsOn: 1 });
    const weekDays = eachDayOfInterval({ start: weekStart, end: weekEnd });
    
    const total = weekDays.reduce((sum, d) => {
      const dateStr = format(d, 'yyyy-MM-dd');
      return sum + (schedule[dateStr]?.[empId]?.customHours || 0);
    }, 0);
    return Math.round(total * 10) / 10;
  };

  const currentWeeklyHours = useMemo(() => {
    return Math.round(employees.reduce((sum, emp) => sum + calculateTotalHours(emp.id, currentDate), 0) * 10) / 10;
  }, [schedule, employees, currentDate]);

  const getEmployeeBadge = (type: string) => {
    switch(type) {
      case 'FT': return <span className="text-[10px] px-1.5 py-0.5 rounded bg-indigo-50 text-indigo-600 border border-indigo-100">正職 (FT)</span>;
      case 'PPT': return <span className="text-[10px] px-1.5 py-0.5 rounded bg-fuchsia-50 text-fuchsia-600 border border-fuchsia-100">可值班兼職 (PPT)</span>;
      case 'PT': return <span className="text-[10px] px-1.5 py-0.5 rounded bg-orange-50 text-orange-600 border border-orange-100">一般兼職 (PT)</span>;
      default: return null;
    }
  };

  const getAvailableDropdownShifts = (empType: string) => {
    let available: any[] = [];
    if (empType === 'FT') available = shifts.filter(s => s.type === 'FT' || s.type === 'PT' || s.type === 'OTHER');
    if (empType === 'PPT') available = shifts.filter(s => s.type === 'FT' || s.type === 'PT' || s.type === 'OTHER'); 
    if (empType === 'PT') available = shifts.filter(s => s.type === 'PT' || s.type === 'OTHER');
    return [...available, OFF_SHIFT];
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-jp-bg flex flex-col items-center justify-center">
        <div className="w-12 h-12 border-4 border-jp-accent/20 border-t-jp-accent rounded-full animate-spin mb-4"></div>
        <p className="text-jp-muted text-sm font-medium tracking-widest">資料同步中...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-jp-bg text-jp-ink font-sans selection:bg-jp-accent/20 pb-10">
      <nav className="bg-jp-paper border-b border-jp-border sticky top-0 z-30">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between h-16">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 bg-jp-accent rounded-md flex items-center justify-center text-white">
                <CalendarIcon className="h-5 w-5" />
              </div>
              <span className="text-lg font-medium tracking-tight text-jp-ink">康是美智能排班</span>
            </div>
            <div className="flex space-x-1 sm:space-x-4">
              <button onClick={() => setActiveTab('schedule')} className={`inline-flex items-center px-4 py-2 text-sm font-medium transition-all ${activeTab === 'schedule' ? 'text-jp-accent border-b-2 border-jp-accent' : 'text-jp-muted hover:text-jp-ink'}`}>
                <CalendarDays className="w-4 h-4 mr-2" /> 班表
              </button>
              <button onClick={() => setActiveTab('employees')} className={`inline-flex items-center px-4 py-2 text-sm font-medium transition-all ${activeTab === 'employees' ? 'text-jp-accent border-b-2 border-jp-accent' : 'text-jp-muted hover:text-jp-ink'}`}>
                <Users className="w-4 h-4 mr-2" /> 員工
              </button>
              <button onClick={() => setActiveTab('settings')} className={`inline-flex items-center px-4 py-2 text-sm font-medium transition-all ${activeTab === 'settings' ? 'text-jp-accent border-b-2 border-jp-accent' : 'text-jp-muted hover:text-jp-ink'}`}>
                <Settings className="w-4 h-4 mr-2" /> 設定
              </button>
            </div>
          </div>
        </div>
      </nav>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        
        {/* === 班表總覽 === */}
        {activeTab === 'schedule' && (
          <div className="space-y-6 fade-in">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-jp-paper p-6 rounded-lg border border-jp-border shadow-sm">
              <div className="flex items-center gap-4">
                <div className="flex items-center bg-jp-bg rounded-md p-1 border border-jp-border">
                  <button 
                    onClick={() => setCurrentDate(viewMode === 'week' ? addDays(currentDate, -7) : addMonths(currentDate, -1))}
                    className="p-1.5 hover:bg-jp-paper rounded transition-colors"
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </button>
                  <div className="px-4 text-sm font-medium min-w-[120px] text-center">
                    {viewMode === 'week' 
                      ? `${format(startOfWeek(currentDate, { weekStartsOn: 1 }), 'MM/dd')} - ${format(endOfWeek(currentDate, { weekStartsOn: 1 }), 'MM/dd')}`
                      : format(currentDate, 'yyyy年 MM月')}
                  </div>
                  <button 
                    onClick={() => setCurrentDate(viewMode === 'week' ? addDays(currentDate, 7) : addMonths(currentDate, 1))}
                    className="p-1.5 hover:bg-jp-paper rounded transition-colors"
                  >
                    <ChevronRight className="w-4 h-4" />
                  </button>
                </div>
                
                <div className="flex bg-jp-bg rounded-md p-1 border border-jp-border">
                  <button 
                    onClick={() => setViewMode('week')}
                    className={`px-3 py-1 text-xs font-medium rounded transition-all ${viewMode === 'week' ? 'bg-jp-paper shadow-sm text-jp-accent' : 'text-jp-muted'}`}
                  >
                    週視圖
                  </button>
                  <button 
                    onClick={() => setViewMode('month')}
                    className={`px-3 py-1 text-xs font-medium rounded transition-all ${viewMode === 'month' ? 'bg-jp-paper shadow-sm text-jp-accent' : 'text-jp-muted'}`}
                  >
                    月視圖
                  </button>
                </div>
              </div>

              <div className="flex items-center gap-3">
                <div className="text-right hidden sm:block">
                  <div className="text-xs text-jp-muted">當週預算工時</div>
                  <div className={`text-sm font-medium ${currentWeeklyHours > storeBudget.weekly ? 'text-jp-holiday' : 'text-jp-ink'}`}>
                    {currentWeeklyHours} / {storeBudget.weekly}
                  </div>
                </div>
                <button 
                  onClick={() => saveScheduleToFirebase(schedule, false)} 
                  disabled={saveStatus === 'saving'}
                  className={`flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-md border transition-all duration-200 ${
                    !hasUnsavedChanges && saveStatus === 'saved' 
                      ? 'bg-emerald-50 border-emerald-200 text-emerald-600' 
                      : saveStatus === 'saving'
                      ? 'bg-jp-bg border-jp-border text-jp-muted cursor-wait'
                      : 'bg-jp-accent text-white border-jp-accent shadow-sm hover:shadow-md'
                  }`}
                >
                  {saveStatus === 'saving' ? (
                    <RefreshCw className="w-4 h-4 animate-spin" />
                  ) : (!hasUnsavedChanges && saveStatus === 'saved') ? (
                    <CheckCircle2 className="w-4 h-4" />
                  ) : (
                    <History className="w-4 h-4" />
                  )}
                  {saveStatus === 'saving' ? '儲存中...' : (!hasUnsavedChanges && saveStatus === 'saved') ? '已儲存' : '儲存班表'}
                </button>
                <button 
                  onClick={handleExportImage} 
                  className="jp-button-secondary flex items-center gap-2"
                >
                  <Clock className="w-4 h-4" /> 匯出圖片
                </button>
                <button 
                  onClick={() => handleAutoSchedule(currentDate)} 
                  className="jp-button-primary flex items-center gap-2"
                >
                  <RefreshCw className="w-4 h-4" /> 智能排班
                </button>
              </div>
            </div>

            {complianceIssues.length > 0 && (
              <div className="bg-[#FFF8F8] border border-[#FFE4E4] p-4 rounded-lg flex gap-3">
                <AlertCircle className="w-5 h-5 text-jp-holiday shrink-0" />
                <ul className="text-xs text-jp-holiday space-y-1">
                  {complianceIssues.map((issue, idx) => (
                    <li key={idx}>{issue}</li>
                  ))}
                </ul>
              </div>
            )}

            <div className="jp-card overflow-hidden" id="schedule-table">
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-jp-border">
                  <thead className="bg-jp-bg/50">
                    <tr>
                      <th className="px-6 py-4 text-left text-[11px] font-medium text-jp-muted uppercase tracking-wider w-48 border-r border-jp-border">員工 / 工時</th>
                      {eachDayOfInterval({
                        start: startOfWeek(currentDate, { weekStartsOn: 1 }),
                        end: endOfWeek(currentDate, { weekStartsOn: 1 })
                      }).map(day => {
                        const dateStr = format(day, 'yyyy-MM-dd');
                        const holiday = TAIWAN_HOLIDAYS[dateStr];
                        return (
                          <th key={dateStr} className={`px-2 py-4 text-center w-32 ${isWeekend(day) ? 'bg-jp-bg/30' : ''}`}>
                            <div className={`text-[11px] font-medium ${holiday ? 'text-jp-holiday' : 'text-jp-muted'}`}>
                              {format(day, 'EEE', { locale: zhTW })}
                            </div>
                            <div className={`text-sm font-bold mt-0.5 ${holiday ? 'text-jp-holiday' : isToday(day) ? 'text-jp-accent' : 'text-jp-ink'}`}>
                              {format(day, 'MM/dd')}
                            </div>
                            {holiday && <div className="text-[9px] text-jp-holiday mt-0.5 font-normal">{holiday}</div>}
                          </th>
                        );
                      })}
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-jp-border">
                    {employees.map((emp) => {
                      const totalHours = calculateTotalHours(emp.id, currentDate);
                      const isOverHours = totalHours > emp.maxHours;
                      return (
                        <tr key={emp.id} className="hover:bg-jp-bg/20 transition-colors">
                          <td className="px-6 py-4 whitespace-nowrap border-r border-jp-border">
                            <div className="text-sm font-medium text-jp-ink flex items-center gap-2">
                              {emp.name}
                            </div>
                            <div className="flex items-center gap-1 mt-1">
                              {getEmployeeBadge(emp.type)}
                            </div>
                            <div className={`text-[10px] mt-2 ${isOverHours ? 'text-jp-holiday font-bold' : 'text-jp-muted'}`}>
                              本週: {totalHours}h / {emp.maxHours}h
                            </div>
                          </td>
                          {eachDayOfInterval({
                            start: startOfWeek(currentDate, { weekStartsOn: 1 }),
                            end: endOfWeek(currentDate, { weekStartsOn: 1 })
                          }).map((day) => {
                            const dateStr = format(day, 'yyyy-MM-dd');
                            const cellObj = schedule[dateStr]?.[emp.id] || { shiftId: 'OFF', customTime: '', customHours: 0 };
                            const shiftId = cellObj.shiftId;
                            const shift = shiftId === 'OFF' ? OFF_SHIFT : shifts.find(s => s.id === shiftId);
                            const dayIndex = (day.getDay() + 6) % 7;
                            const isPreferredOff = emp.preferredOff.includes(dayIndex);
                            const isSelected = selectedCell?.empId === emp.id && selectedCell?.date === dateStr;

                            return (
                              <td key={dateStr} className={`px-1 py-2 relative ${isWeekend(day) ? 'bg-jp-bg/10' : ''}`}>
                                <div 
                                  onClick={() => setSelectedCell({ empId: emp.id, date: dateStr })}
                                  className={`w-full h-full min-h-[4.5rem] rounded-md border flex flex-col items-center justify-center p-1.5 cursor-pointer transition-all duration-200 hover:shadow-sm ${shift?.color} ${isSelected ? 'ring-2 ring-jp-accent ring-offset-1' : 'border-transparent'} ${isPreferredOff && shiftId !== 'OFF' ? 'border-jp-holiday/30 bg-jp-holiday/5' : ''}`}
                                >
                                  <span className="text-xs font-medium">{shift?.name}</span>
                                  {cellObj.customTime && <span className="text-[10px] opacity-70 mt-1">{cellObj.customTime}</span>}
                                  {isPreferredOff && shiftId !== 'OFF' && <AlertCircle className="w-3 h-3 text-jp-holiday absolute top-1 right-1" />}
                                </div>
                              </td>
                            );
                          })}
                        </tr>
                      );
                    })}
                  </tbody>
                  <tfoot className="bg-jp-bg/30 border-t border-jp-border">
                    <tr>
                      <td className="px-6 py-4 text-xs font-medium text-jp-ink border-r border-jp-border">
                        每日工時預算
                      </td>
                      {eachDayOfInterval({
                        start: startOfWeek(currentDate, { weekStartsOn: 1 }),
                        end: endOfWeek(currentDate, { weekStartsOn: 1 })
                      }).map((day, dayIndex) => {
                        const dateStr = format(day, 'yyyy-MM-dd');
                        let dailyActual = 0;
                        employees.forEach(emp => {
                          const cellObj = schedule[dateStr]?.[emp.id];
                          if (cellObj && cellObj.shiftId !== 'OFF') {
                            dailyActual += (cellObj.customHours || 0);
                          }
                        });
                        dailyActual = Math.round(dailyActual * 10) / 10;
                        const budgetIdx = (day.getDay() + 6) % 7;
                        const dailyBudget = storeBudget.daily[budgetIdx];
                        const isDailyOver = dailyActual > dailyBudget;

                        return (
                          <td key={dateStr} className="px-2 py-4 text-center">
                            <div className={`text-xs font-medium ${isDailyOver ? 'text-jp-holiday' : 'text-jp-ink'}`}>
                              {dailyActual} <span className="text-[10px] font-normal opacity-50">/ {dailyBudget}</span>
                            </div>
                          </td>
                        )
                      })}
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>
            
            <div className="flex items-center gap-6 text-[10px] text-jp-muted px-2">
              <div className="flex items-center gap-1.5">
                <div className="w-3 h-3 rounded-sm bg-jp-bg border border-jp-border"></div>
                <span>平日</span>
              </div>
              <div className="flex items-center gap-1.5">
                <div className="w-3 h-3 rounded-sm bg-jp-bg/30 border border-jp-border"></div>
                <span>週末</span>
              </div>
              <div className="flex items-center gap-1.5">
                <div className="w-3 h-3 rounded-sm border border-jp-holiday/30 bg-jp-holiday/5"></div>
                <span>員工偏好休假</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="text-jp-holiday font-bold">紅色日期</span>
                <span>國定假日</span>
              </div>
            </div>
          </div>
        )}

        {/* === 員工管理 === */}
        {activeTab === 'employees' && (
          <div className="space-y-6 fade-in">
            <div className="bg-jp-paper p-8 rounded-lg border border-jp-border shadow-sm">
              <div className="flex justify-between items-center mb-8">
                <div>
                  <h2 className="text-lg font-medium text-jp-ink">員工名單與偏好</h2>
                  <p className="text-xs text-jp-muted mt-1">管理店員資訊、聘用身分及排班偏好</p>
                </div>
                <button 
                  onClick={() => setEditingEmp({ id: Date.now().toString(), name: '', type: 'FT', preferredOff: [], maxHours: 40, shiftPreference: 'NONE', isNew: true })}
                  className="jp-button-secondary flex items-center gap-2"
                >
                  <Plus className="w-4 h-4" /> 新增員工
                </button>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {employees.map(emp => (
                  <div key={emp.id} className="border border-jp-border rounded-lg p-5 hover:border-jp-accent transition-all bg-jp-bg/10 group">
                    <div className="flex justify-between items-start mb-4">
                      <div>
                        <h3 className="font-medium text-jp-ink text-base">{emp.name}</h3>
                        <div className="mt-2 flex items-center gap-1.5 flex-wrap">
                          {getEmployeeBadge(emp.type)}
                          {emp.shiftPreference === 'MORNING' && <span className="text-[10px] px-2 py-0.5 rounded bg-blue-50 text-blue-600 border border-blue-100">偏好早班</span>}
                          {emp.shiftPreference === 'EVENING' && <span className="text-[10px] px-2 py-0.5 rounded bg-indigo-50 text-indigo-600 border border-indigo-100">偏好晚班</span>}
                        </div>
                      </div>
                      <button onClick={() => setEditingEmp({ ...emp })} className="text-jp-muted hover:text-jp-accent transition-colors p-1.5 rounded-full hover:bg-white">
                        <Edit3 className="w-4 h-4" />
                      </button>
                    </div>
                    <div className="space-y-3">
                      <div className="flex justify-between text-[11px]">
                        <span className="text-jp-muted">每週工時上限</span>
                        <span className="text-jp-ink font-medium">{emp.maxHours} 小時</span>
                      </div>
                      <div className="pt-3 border-t border-jp-border">
                        <p className="text-[10px] text-jp-muted mb-2">固定休假偏好</p>
                        <div className="flex flex-wrap gap-1.5">
                          {emp.preferredOff.length === 0 && <span className="text-[10px] text-jp-muted italic">未設定</span>}
                          {WEEKDAYS.map((day, idx) => {
                            if (!emp.preferredOff.includes(idx)) return null;
                            return <span key={idx} className="text-[10px] px-2 py-0.5 rounded bg-jp-paper border border-jp-border text-jp-ink">週{day}</span>
                          })}
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* === 排班設定與預算 === */}
        {activeTab === 'settings' && (
          <div className="space-y-6 fade-in max-w-6xl mx-auto">
            <div className="bg-jp-paper p-8 rounded-lg border border-jp-border shadow-sm">
              <h2 className="text-lg font-medium text-jp-ink flex items-center mb-8">
                <DollarSign className="w-5 h-5 mr-3 text-jp-accent" /> 門市工時與預算
              </h2>
              <div className="grid grid-cols-1 lg:grid-cols-4 gap-10">
                <div className="lg:col-span-3">
                  <label className="block text-xs font-medium text-jp-muted mb-4 uppercase tracking-wider">每日工時預算 (小時)</label>
                  <div className="grid grid-cols-7 gap-3">
                    {WEEKDAYS.map((day, idx) => {
                      return (
                        <div key={idx} className="bg-jp-bg p-3 rounded-lg border border-jp-border">
                          <div className="text-[10px] text-jp-muted mb-2 text-center font-medium">週{day}</div>
                          <input 
                            type="number" 
                            value={storeBudget.daily[idx]} 
                            onChange={(e) => {
                              const newDaily = [...storeBudget.daily];
                              newDaily[idx] = parseInt(e.target.value) || 0;
                              setStoreBudget({...storeBudget, daily: newDaily});
                            }}
                            className="w-full text-center bg-white rounded border-jp-border text-sm py-1.5 focus:ring-jp-accent focus:border-jp-accent font-medium" 
                          />
                        </div>
                      )
                    })}
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-medium text-jp-muted mb-4 uppercase tracking-wider">週預算總額</label>
                  <div className="bg-jp-accent/5 p-4 rounded-lg border border-jp-accent/20 h-[84px] flex items-center">
                    <div className="relative w-full">
                      <input 
                        type="number" 
                        value={storeBudget.weekly} 
                        onChange={(e) => setStoreBudget({...storeBudget, weekly: parseInt(e.target.value) || 0})}
                        className="w-full text-center bg-white rounded border-jp-accent/30 text-xl py-2 focus:ring-jp-accent focus:border-jp-accent font-bold text-jp-accent" 
                      />
                      <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] text-jp-accent font-medium">H</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div className="bg-jp-paper p-8 rounded-lg border border-jp-border shadow-sm">
              <div className="flex justify-between items-center mb-8">
                <h2 className="text-lg font-medium text-jp-ink flex items-center">
                  <Clock className="w-5 h-5 mr-3 text-jp-accent" /> 班別定義與人力需求
                </h2>
                <button 
                  onClick={() => {
                    const newId = `S${Date.now()}`;
                    setShifts([...shifts, { id: newId, name: '新班別', time: '12:00-20:00', hours: 8, type: 'FT', required: [0,0,0,0,0,0,0], color: COLORS[shifts.length % COLORS.length] }]);
                  }}
                  className="jp-button-secondary flex items-center gap-2"
                >
                  <Plus className="w-4 h-4" /> 新增班別
                </button>
              </div>
              
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-jp-border">
                  <thead>
                    <tr className="text-left text-[11px] font-medium text-jp-muted uppercase tracking-wider">
                      <th className="pb-4 pr-4">班別名稱</th>
                      <th className="pb-4 px-4">時間段</th>
                      <th className="pb-4 px-2 text-center">時數</th>
                      <th className="pb-4 px-4">屬性</th>
                      <th className="pb-4 px-4">每日所需人數 (一 至 日)</th>
                      <th className="pb-4 pl-4 text-right"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-jp-border">
                    {shifts.map((shift, idx) => (
                      <tr key={shift.id} className="group hover:bg-jp-bg/10 transition-colors">
                        <td className="py-4 pr-4">
                          <input type="text" value={shift.name} onChange={(e) => { const n = [...shifts]; n[idx].name = e.target.value; setShifts(n); }} className={`w-24 rounded border-jp-border text-xs py-1.5 focus:ring-jp-accent focus:border-jp-accent ${shift.color.split(' ')[0]} ${shift.color.split(' ')[1]}`} />
                        </td>
                        <td className="py-4 px-4">
                          <input type="text" value={shift.time} onChange={(e) => { const n = [...shifts]; n[idx].time = e.target.value; setShifts(n); }} className="w-28 rounded border-jp-border text-xs py-1.5 focus:ring-jp-accent focus:border-jp-accent bg-white" placeholder="09:00-17:00" />
                        </td>
                        <td className="py-4 px-2 text-center">
                          <input type="number" min="0" max="24" value={shift.hours} onChange={(e) => { const n = [...shifts]; n[idx].hours = parseInt(e.target.value)||0; setShifts(n); }} className="w-14 rounded border-jp-border text-xs text-center py-1.5 focus:ring-jp-accent focus:border-jp-accent bg-white" />
                        </td>
                        <td className="py-4 px-4">
                          <select value={shift.type} onChange={(e) => { const n = [...shifts]; n[idx].type = e.target.value; setShifts(n); }} className="rounded border-jp-border text-xs py-1.5 focus:ring-jp-accent focus:border-jp-accent bg-white w-32">
                            <option value="FT">值班需求</option>
                            <option value="PT">一般支援</option>
                            <option value="OTHER">不計人力</option>
                          </select>
                        </td>
                        <td className="py-4 px-4">
                          {shift.type !== 'OTHER' ? (
                            <div className="flex gap-1.5">
                              {WEEKDAYS.map((day, dIdx) => (
                                <div key={dIdx} className="flex flex-col items-center gap-1">
                                  <span className="text-[9px] text-jp-muted">週{day}</span>
                                  <input 
                                    type="number" min="0" 
                                    value={shift.required[dIdx]} 
                                    onChange={(e) => { 
                                      const n = [...shifts]; 
                                      n[idx].required[dIdx] = parseInt(e.target.value)||0; 
                                      setShifts(n); 
                                    }} 
                                    className="w-9 rounded border-jp-border text-xs text-center py-1 px-1 focus:ring-jp-accent focus:border-jp-accent bg-white" 
                                  />
                                </div>
                              ))}
                            </div>
                          ) : (
                            <div className="text-[10px] text-jp-muted italic py-2">不參與自動排班</div>
                          )}
                        </td>
                        <td className="py-4 pl-4 text-right">
                          <button onClick={() => setShifts(shifts.filter(s => s.id !== shift.id))} className="p-2 text-jp-muted hover:text-jp-holiday hover:bg-jp-holiday/5 rounded-full transition-all opacity-0 group-hover:opacity-100"><Trash2 className="w-4 h-4" /></button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="pt-8 mt-6 border-t border-jp-border flex justify-end">
                <button onClick={() => { handleAutoSchedule(currentDate); setActiveTab('schedule'); }} className="jp-button-primary">
                  儲存並更新班表
                </button>
              </div>
            </div>
          </div>
        )}
      </main>

      {selectedCell && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-jp-ink/20 backdrop-blur-[2px] fade-in">
          <div className="bg-jp-paper rounded-lg w-full max-w-sm shadow-2xl overflow-hidden border border-jp-border">
            <div className="flex justify-between items-center p-4 border-b border-jp-border">
              <div>
                <h3 className="text-sm font-medium text-jp-ink">編輯班別</h3>
                <p className="text-[10px] text-jp-muted mt-0.5">
                  {employees.find(e => e.id === selectedCell.empId)?.name} · {selectedCell.date}
                </p>
              </div>
              <button 
                onClick={() => {
                  saveScheduleToFirebase(schedule);
                  setSelectedCell(null);
                }} 
                className="text-jp-muted hover:text-jp-ink transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <div className="p-4 space-y-4">
              <div>
                <label className="block text-[10px] font-medium text-jp-muted mb-2 uppercase tracking-wider">選擇班別</label>
                <div className="grid grid-cols-2 gap-2">
                  {getAvailableDropdownShifts(employees.find(e => e.id === selectedCell.empId)?.type || '').map(s => {
                    const currentShiftId = schedule[selectedCell.date]?.[selectedCell.empId]?.shiftId || 'OFF';
                    return (
                      <button
                        key={s.id}
                        onClick={() => updateCellShift(selectedCell.empId, selectedCell.date, s.id)}
                        className={`text-left px-3 py-2.5 rounded border transition-all flex flex-col ${currentShiftId === s.id ? 'bg-jp-accent/10 border-jp-accent text-jp-accent' : 'bg-white border-jp-border text-jp-ink hover:bg-jp-bg'}`}
                      >
                        <span className="text-xs font-medium">{s.name}</span>
                        <span className="text-[9px] opacity-60">{s.time}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {schedule[selectedCell.date]?.[selectedCell.empId]?.shiftId !== 'OFF' && (
                <div className="pt-4 border-t border-jp-border">
                  <div className="space-y-4">
                    <div>
                      <label className="block text-[10px] font-medium text-jp-muted mb-1.5 uppercase tracking-wider">自定義時間</label>
                      <div className="flex items-center gap-2">
                        <input 
                          type="time" 
                          value={schedule[selectedCell.date]?.[selectedCell.empId]?.customTime?.split('-')[0] || '09:00'} 
                          onChange={(e) => {
                            const current = schedule[selectedCell.date]?.[selectedCell.empId]?.customTime || '09:00-17:00';
                            const [_, end] = current.split('-');
                            updateCellCustom(selectedCell.empId, selectedCell.date, {customTime: `${e.target.value}-${end || '17:00'}`});
                          }}
                          className="flex-1 rounded border-jp-border text-xs py-2 focus:ring-jp-accent focus:border-jp-accent" 
                        />
                        <span className="text-jp-muted">-</span>
                        <input 
                          type="time" 
                          value={schedule[selectedCell.date]?.[selectedCell.empId]?.customTime?.split('-')[1] || '17:00'} 
                          onChange={(e) => {
                            const current = schedule[selectedCell.date]?.[selectedCell.empId]?.customTime || '09:00-17:00';
                            const [start, _] = current.split('-');
                            updateCellCustom(selectedCell.empId, selectedCell.date, {customTime: `${start || '09:00'}-${e.target.value}`});
                          }}
                          className="flex-1 rounded border-jp-border text-xs py-2 focus:ring-jp-accent focus:border-jp-accent" 
                        />
                      </div>
                    </div>
                    <div>
                      <label className="block text-[10px] font-medium text-jp-muted mb-1.5 uppercase tracking-wider">工時 (小時)</label>
                      <input 
                        type="number" 
                        step="0.5" 
                        value={schedule[selectedCell.date]?.[selectedCell.empId]?.customHours || 0} 
                        onChange={(e) => updateCellCustom(selectedCell.empId, selectedCell.date, {customHours: parseFloat(e.target.value) || 0})} 
                        className="w-full rounded border-jp-border text-xs py-2 focus:ring-jp-accent focus:border-jp-accent" 
                      />
                    </div>
                  </div>
                </div>
              )}
            </div>

            <div className="p-4 bg-jp-bg/30 border-t border-jp-border flex justify-end">
              <button 
                onClick={() => {
                  saveScheduleToFirebase(schedule);
                  setSelectedCell(null);
                }} 
                className="jp-button-primary w-full"
              >
                確定並儲存
              </button>
            </div>
          </div>
        </div>
      )}

      {editingEmp && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-jp-ink/20 backdrop-blur-[2px] fade-in">
          <div className="bg-jp-paper rounded-lg w-full max-w-md shadow-2xl overflow-hidden border border-jp-border">
            <div className="flex justify-between items-center p-6 border-b border-jp-border">
              <h3 className="text-base font-medium text-jp-ink">{editingEmp.isNew ? '新增員工' : '編輯員工資料'}</h3>
              <button onClick={() => setEditingEmp(null)} className="text-jp-muted hover:text-jp-ink transition-colors"><X className="w-5 h-5" /></button>
            </div>
            
            <div className="p-6 space-y-5">
              <div>
                <label className="block text-[11px] font-medium text-jp-muted mb-2 uppercase tracking-wider">員工姓名</label>
                <input type="text" value={editingEmp.name} onChange={(e) => setEditingEmp({...editingEmp, name: e.target.value})} className="w-full rounded border-jp-border py-2 text-sm focus:ring-jp-accent focus:border-jp-accent" placeholder="請輸入姓名" />
              </div>
              
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                <div>
                  <label className="block text-[11px] font-medium text-jp-muted mb-2 uppercase tracking-wider">聘用身分</label>
                  <select value={editingEmp.type} onChange={(e) => setEditingEmp({...editingEmp, type: e.target.value})} className="w-full rounded border-jp-border py-2 text-sm focus:ring-jp-accent focus:border-jp-accent bg-white">
                    <option value="FT">正職 (FT)</option>
                    <option value="PPT">可值班兼職 (PPT)</option>
                    <option value="PT">一般兼職 (PT)</option>
                  </select>
                </div>
                <div>
                  <label className="block text-[11px] font-medium text-jp-muted mb-2 uppercase tracking-wider">班別偏好</label>
                  <select value={editingEmp.shiftPreference || 'NONE'} onChange={(e) => setEditingEmp({...editingEmp, shiftPreference: e.target.value})} className="w-full rounded border-jp-border py-2 text-sm focus:ring-jp-accent focus:border-jp-accent bg-white">
                    <option value="NONE">不偏好</option>
                    <option value="MORNING">優先早班</option>
                    <option value="EVENING">優先晚班</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-medium text-jp-muted mb-2 uppercase tracking-wider">每週可排工時上限</label>
                <div className="relative">
                  <input type="number" value={editingEmp.maxHours} onChange={(e) => setEditingEmp({...editingEmp, maxHours: parseInt(e.target.value) || 0})} className="w-full rounded border-jp-border py-2 text-sm focus:ring-jp-accent focus:border-jp-accent" />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] text-jp-muted">小時</span>
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-medium text-jp-muted mb-3 uppercase tracking-wider">固定休假偏好 (不可排班日)</label>
                <div className="grid grid-cols-4 gap-2">
                  {WEEKDAYS.map((day, idx) => {
                    const isSelected = editingEmp.preferredOff.includes(idx);
                    return (
                      <button
                        key={idx}
                        onClick={() => {
                          const newOff = isSelected ? editingEmp.preferredOff.filter((d: number) => d !== idx) : [...editingEmp.preferredOff, idx].sort();
                          setEditingEmp({...editingEmp, preferredOff: newOff});
                        }}
                        className={`px-2 py-2 rounded text-[11px] transition-all border ${isSelected ? 'bg-jp-accent/10 border-jp-accent text-jp-accent font-medium' : 'bg-white border-jp-border text-jp-muted hover:bg-jp-bg'}`}
                      >
                        週{day}
                      </button>
                    )
                  })}
                </div>
              </div>

              {/* 課表設定 (PT/PPT) */}
              {(editingEmp.type === 'PT' || editingEmp.type === 'PPT') && (
                <div className="pt-4 border-t border-jp-border">
                  <div className="flex justify-between items-center mb-3">
                    <label className="block text-[11px] font-medium text-jp-muted uppercase tracking-wider">上課/不便排班時段</label>
                    <button 
                      onClick={() => setEditingEmp({...editingEmp, classSchedule: [...(editingEmp.classSchedule || []), { day: 0, startTime: '09:00', endTime: '12:00' }]})}
                      className="text-[10px] text-jp-accent hover:underline flex items-center gap-1"
                    >
                      <Plus className="w-3 h-3" /> 新增時段
                    </button>
                  </div>
                  <div className="space-y-2 max-h-32 overflow-y-auto pr-1">
                    {(editingEmp.classSchedule || []).map((item: any, idx: number) => (
                      <div key={idx} className="flex items-center gap-2 bg-jp-bg/30 p-2 rounded border border-jp-border">
                        <select 
                          value={item.day} 
                          onChange={(e) => {
                            const newSched = [...editingEmp.classSchedule];
                            newSched[idx].day = parseInt(e.target.value);
                            setEditingEmp({...editingEmp, classSchedule: newSched});
                          }}
                          className="text-[10px] rounded border-jp-border py-1 bg-white"
                        >
                          {WEEKDAYS.map((d, i) => <option key={i} value={i}>週{d}</option>)}
                        </select>
                        <input 
                          type="time" 
                          value={item.startTime} 
                          onChange={(e) => {
                            const newSched = [...editingEmp.classSchedule];
                            newSched[idx].startTime = e.target.value;
                            setEditingEmp({...editingEmp, classSchedule: newSched});
                          }}
                          className="text-[10px] rounded border-jp-border py-1 flex-1"
                        />
                        <span className="text-jp-muted">-</span>
                        <input 
                          type="time" 
                          value={item.endTime} 
                          onChange={(e) => {
                            const newSched = [...editingEmp.classSchedule];
                            newSched[idx].endTime = e.target.value;
                            setEditingEmp({...editingEmp, classSchedule: newSched});
                          }}
                          className="text-[10px] rounded border-jp-border py-1 flex-1"
                        />
                        <button 
                          onClick={() => {
                            const newSched = editingEmp.classSchedule.filter((_: any, i: number) => i !== idx);
                            setEditingEmp({...editingEmp, classSchedule: newSched});
                          }}
                          className="text-jp-holiday p-1"
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                      </div>
                    ))}
                    {(!editingEmp.classSchedule || editingEmp.classSchedule.length === 0) && (
                      <p className="text-[10px] text-jp-muted italic text-center py-2">尚無設定時段</p>
                    )}
                  </div>
                </div>
              )}
            </div>

            <div className="p-6 border-t border-jp-border bg-jp-bg/30 flex justify-between items-center">
              {!editingEmp.isNew ? (
                <button onClick={() => handleDeleteEmployee(editingEmp.id)} className="text-jp-holiday hover:underline text-xs font-medium flex items-center gap-1">
                  <Trash2 className="w-3.5 h-3.5" /> 刪除員工
                </button>
              ) : <div />}
              
              <div className="flex gap-3">
                <button onClick={() => setEditingEmp(null)} className="jp-button-secondary">取消</button>
                <button onClick={handleSaveEmployee} disabled={!editingEmp.name.trim()} className="jp-button-primary disabled:opacity-50 disabled:cursor-not-allowed">儲存設定</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
