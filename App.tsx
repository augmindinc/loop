import React, { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import { StatusBar } from 'expo-status-bar';
import { StyleSheet, Text, View, TouchableOpacity, Dimensions, ScrollView, Modal, TextInput, Switch, Platform, TouchableWithoutFeedback, Keyboard, FlatList, Alert, Animated, PanResponder, Pressable, Image, KeyboardAvoidingView, ActivityIndicator } from 'react-native';
import DragList, { DragListRenderItemInfo } from 'react-native-draglist';
import { SafeAreaView, SafeAreaProvider } from 'react-native-safe-area-context';
import { Feather, Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import DateTimePicker from '@react-native-community/datetimepicker';
import { Picker } from '@react-native-picker/picker';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import { BlurView } from 'expo-blur';
import axios from 'axios';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

const { width, height } = Dimensions.get('window');
const ITEM_WIDTH = width / 7;
const STORAGE_KEY = '@alex_tasks';
const META_KEY = '@alex_meta';
const NOTIFICATION_SETTING_KEY = '@alex_notification_enabled';
const THEME_STORAGE_KEY = '@alex_theme';
const GEMINI_API_KEY = process.env.EXPO_PUBLIC_GEMINI_API_KEY || "";

interface AiTask {
  title: string;
  time?: string;
  duration?: string;
  repeat?: string;
}

interface AiResult {
  comment: string;
  tasks: AiTask[];
}


const BACKGROUND_OPTIONS = [
  { id: 'default', color: '#0a0a0a', label: '기본' },
  { id: 'dark_blue', color: '#0F172A', label: '네이비' },
  { id: 'deep_purple', color: '#13111C', label: '딥퍼플' },
  { id: 'pure_black', color: '#000000', label: '블랙' },
];

const ACCENT_OPTIONS = [
  { id: 'default', color: '#7B52FF', label: '퍼플' },
  { id: 'blue', color: '#3B82F6', label: '블루' },
  { id: 'teal', color: '#14B8A6', label: '틸' },
  { id: 'pink', color: '#EC4899', label: '핑크' },
  { id: 'orange', color: '#F97316', label: '오렌지' },
];

const isSameDay = (date1: Date, date2: Date) => {
  return date1.getFullYear() === date2.getFullYear() &&
    date1.getMonth() === date2.getMonth() &&
    date1.getDate() === date2.getDate();
};

const getYYYYMMDD = (date: Date) => date.toISOString().split('T')[0];

const DAYS_KR = ['일', '월', '화', '수', '목', '금', '토'];

interface Task {
  id: string;
  title: string;
  hasTime: boolean;
  time: Date;
  hasDuration: boolean;
  duration: string;
  tab: 'flow' | 'inbox';
  createdAt: number;
  dateString: string;
  isCompleted: boolean;
  repeat?: string;
  groupId?: string;
  notification?: string;
}

interface MetaState {
  [key: string]: any;
}

const DURATION_OPTIONS = [
  "10분", "15분", "30분", "1시간", "1.5시간", "2시간", "2.5시간", "3시간", "3.5시간", "4시간"
];

const NOTIFICATION_OPTIONS = [
  '안 함', '5분 전', '10분 전', '30분 전', '1시간 전', '정시'
];

const REPEAT_OPTIONS = [
  '안 함', '매일', '평일(월~금)', '주말(토~일)', '매주', '매달'
];

const DropArrow = React.forwardRef<View, { highlighted: boolean, onLayout?: (layout: any) => void }>(({ highlighted, onLayout }, ref) => (
  <View
    ref={ref}
    style={[styles.arrowContainer, highlighted && styles.highlightedArrow]}
    onLayout={onLayout}
  >
    <Feather
      name={highlighted ? "plus-circle" : "arrow-down"}
      size={highlighted ? 32 : 24}
      color={highlighted ? "#7B52FF" : "#333"}
    />
  </View>
));

const InboxTag = ({ task, onSelect }: { task: Task, onSelect: (task: Task) => void }) => {
  return (
    <TouchableOpacity
      onPress={() => onSelect(task)}
      style={styles.inboxTag}
    >
      <Text style={{ color: '#eee', fontSize: 16 }}>{task.title}</Text>
    </TouchableOpacity>
  );
};

const DateItem = React.memo(({ item, selectedDate, stats, wakeCompleted, sleepCompleted, accentColor, onPress, disabled }: {
  item: Date,
  selectedDate: Date,
  stats: { total: number, completed: number },
  wakeCompleted: boolean,
  sleepCompleted: boolean,
  accentColor: string,
  onPress: (date: Date) => void,
  disabled?: boolean
}) => {
  const active = isSameDay(item, selectedDate);
  const dayLabel = DAYS_KR[item.getDay()];
  const dateLabel = item.getDate();
  const isToday = isSameDay(item, new Date());

  const totalCount = stats.total + 2; // +2 for wake/sleep
  const completedCount = stats.completed + (wakeCompleted ? 1 : 0) + (sleepCompleted ? 1 : 0);

  const ratio = totalCount > 0 ? completedCount / totalCount : 0;
  const isCompleted = ratio === 1;
  const activeColor = accentColor;
  const activeTextColor = '#fff';
  const inactiveTextColor = '#666';

  const renderIndicator = () => {
    // const isOnlyWakeSleep = stats.total === 0;
    // if (isOnlyWakeSleep) return null;
    const isOnlyWakeSleep = stats.total === 0;

    // Use transparent if no custom tasks (only wake/sleep default) to maintain layout but hide visual
    const bgColor = isOnlyWakeSleep ? 'transparent' : (active ? '#161616' : '#1F1F1F');
    const barColor = isOnlyWakeSleep ? 'transparent' : (active ? accentColor : '#464646');

    return (
      <View style={{ width: 15, height: 7, borderRadius: 3.5, backgroundColor: bgColor, marginTop: 6, overflow: 'hidden' }}>
        <View style={{ width: `${ratio * 100}%`, height: '100%', backgroundColor: barColor }} />
      </View>
    );
  };

  return (
    <TouchableOpacity
      disabled={disabled}
      style={[
        styles.dateItem,
        disabled && { opacity: 0.3 },
        active && {
          backgroundColor: 'transparent',
          overflow: 'hidden',
          borderWidth: 1.5,
          borderColor: 'rgba(255, 255, 255, 0.2)',
        }
      ]}
      onPress={() => onPress(item)}
      activeOpacity={0.7}
    >
      {active && (
        <>
          <BlurView
            intensity={50}
            tint="dark"
            style={StyleSheet.absoluteFill}
          />
          <View style={{
            ...StyleSheet.absoluteFillObject,
            backgroundColor: 'rgba(255, 255, 255, 0.05)',
          }} />
          <View style={{
            ...StyleSheet.absoluteFillObject,
            backgroundColor: 'rgba(25, 25, 30, 0.5)',
          }} />
        </>
      )}
      <View style={{ alignItems: 'center', justifyContent: 'center', zIndex: 1 }}>
        <Text style={[styles.dayText, active && { color: '#fff' }]}>{isToday && !active ? '오늘' : isToday && active ? '오늘' : dayLabel}</Text>
        <Text style={[styles.dateText, active && { color: '#fff' }]}>{dateLabel}</Text>
        {renderIndicator()}
      </View>
    </TouchableOpacity>
  );
}, (prev, next) => {
  // Strict quality check to prevent unnecessary re-renders
  // Only re-render if active state changes, or stats change
  const wasActive = isSameDay(prev.item, prev.selectedDate);
  const isActive = isSameDay(next.item, next.selectedDate);

  if (wasActive !== isActive) return false; // Re-render if selection changed

  return prev.stats.total === next.stats.total &&
    prev.stats.completed === next.stats.completed &&
    prev.wakeCompleted === next.wakeCompleted &&
    prev.wakeCompleted === next.wakeCompleted &&
    prev.sleepCompleted === next.sleepCompleted &&
    prev.accentColor === next.accentColor &&
    prev.disabled === next.disabled &&
    isSameDay(prev.item, next.item);
});

const DropdownOverlay = ({ visible, onClose, options, selectedValue, onSelect, top, bottom }: any) => {
  if (!visible) return null;
  return (
    <TouchableWithoutFeedback onPress={onClose}>
      <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.6)', zIndex: 9999 }}>
        <TouchableWithoutFeedback>
          <View style={{
            position: 'absolute',
            right: 40,
            top: top,
            bottom: bottom,
            width: 200,
            borderRadius: 20,
            overflow: 'hidden',
            borderWidth: 1,
            borderColor: 'rgba(255,255,255,0.1)',
          }}>
            <BlurView intensity={30} tint="dark" style={{ flex: 1, backgroundColor: 'rgba(30,30,35,0.65)' }}>
              <View style={{ paddingVertical: 6 }}>
                {options.map((option: string) => (
                  <View key={option}>
                    <TouchableOpacity
                      style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 14, paddingHorizontal: 16 }}
                      onPress={() => { onSelect(option); onClose(); }}
                    >
                      <View style={{ width: 24, marginRight: 8, alignItems: 'center' }}>
                        {option === selectedValue && <Feather name="check" size={16} color="#fff" />}
                      </View>
                      <Text style={{ color: '#fff', fontSize: 16, fontWeight: option === selectedValue ? '600' : '400' }}>{option}</Text>
                    </TouchableOpacity>
                    {option === '안 함' && <View style={{ height: 1, backgroundColor: 'rgba(255,255,255,0.1)', marginHorizontal: 16 }} />}
                  </View>
                ))}
              </View>
            </BlurView>
          </View>
        </TouchableWithoutFeedback>
      </View>
    </TouchableWithoutFeedback>
  );
};

function MainApp() {
  // Helper to get Monday of the current week
  const getMonday = (d: Date) => {
    const day = d.getDay() || 7; // Sunday is 7, Mon is 1
    const monday = new Date(d);
    if (day !== 1) monday.setHours(-24 * (day - 1));
    else monday.setHours(0, 0, 0, 0);
    // Correctly reset hours to midnight for consistency
    monday.setHours(0, 0, 0, 0);
    return monday;
  };

  const [currentWeekStart, setCurrentWeekStart] = useState(getMonday(new Date()));
  const [modalVisible, setModalVisible] = useState(false);
  const [isEnabledTime, setIsEnabledTime] = useState(false);
  const [isEnabledDuration, setIsEnabledDuration] = useState(false);
  const [selectedTab, setSelectedTab] = useState<'flow' | 'inbox'>('inbox');
  const [selectedDuration, setSelectedDuration] = useState('1시간');
  /* New states for collapsible pickers */
  const [isTimePickerOpen, setIsTimePickerOpen] = useState(false);
  const [isDurationPickerOpen, setIsDurationPickerOpen] = useState(false);
  const [dropdownPos, setDropdownPos] = useState<{ top?: number, bottom?: number }>({});
  /* New Theme State */
  const [themeId, setThemeId] = useState('default');
  const [accentId, setAccentId] = useState('default');
  const [bgColor, setBgColor] = useState('#0a0a0a');
  const [accentColor, setAccentColor] = useState('#7B52FF');
  const [isPointColorExpanded, setIsPointColorExpanded] = useState(false);

  // Toggle Dark Mode (Simple implementation: default=Dark, light=Light)
  const toggleDarkMode = async (value: boolean) => {
    const newBgId = value ? 'default' : 'light_mode'; // 'default' is dark
    // For light mode, let's define a light color if not in options, or handle logic
    const newBg = value ? '#0a0a0a' : '#f2f2f6'; // #f2f2f6 is standard iOS light gray

    setThemeId(newBgId);
    setBgColor(newBg);
    await AsyncStorage.setItem(THEME_STORAGE_KEY, JSON.stringify({ bgId: newBgId, acId: accentId }));
  };

  const saveTheme = async (newBgId: string, newAcId: string) => {
    try {
      // Just for accent color updates mainly now
      const newBg = bgColor; // Keep current bg
      const newAc = ACCENT_OPTIONS.find(o => o.id === newAcId)?.color || '#7B52FF';

      setAccentId(newAcId);
      setAccentColor(newAc);

      await AsyncStorage.setItem(THEME_STORAGE_KEY, JSON.stringify({ bgId: themeId, acId: newAcId }));
    } catch (e) { console.log('Theme Save Error', e); }
  };

  // Load Settings & Theme
  useEffect(() => {
    const loadSettings = async () => {
      try {
        const notiFn = await AsyncStorage.getItem(NOTIFICATION_SETTING_KEY);
        if (notiFn !== null) setIsAppNotificationEnabled(JSON.parse(notiFn));

        const themeData = await AsyncStorage.getItem(THEME_STORAGE_KEY);
        if (themeData) {
          const { bgId, acId } = JSON.parse(themeData);
          if (bgId) {
            setThemeId(bgId);
            setBgColor(BACKGROUND_OPTIONS.find(o => o.id === bgId)?.color || '#0a0a0a');
          }
          if (acId) {
            setAccentId(acId);
            setAccentColor(ACCENT_OPTIONS.find(o => o.id === acId)?.color || '#7B52FF');
          }
        }
      } catch (e) { console.log('Settings Load Error', e); }
    };
    loadSettings();
  }, []);

  const notificationButtonRef = useRef<View>(null);
  const repeatButtonRef = useRef<View>(null);

  const [notification, setNotification] = useState('안 함');
  const [repeat, setRepeat] = useState('안 함');

  const [taskTitle, setTaskTitle] = useState('');
  const [tasks, setTasks] = useState<Task[]>([]);
  const [completedMeta, setCompletedMeta] = useState<MetaState>({});
  const [editingTaskId, setEditingTaskId] = useState<string | null>(null);
  const [selectedDate, setSelectedDate] = useState(new Date());

  const [inboxVisible, setInboxVisible] = useState(false);
  const [inboxPage, setInboxPage] = useState(1);
  /* New Animation Logic with Hysteresis */
  const scrollY = useRef(new Animated.Value(0)).current;
  const clampedScrollY = scrollY.interpolate({
    inputRange: [0, 1],
    outputRange: [0, 1],
    extrapolateLeft: 'clamp',
  });

  // 0-90: Visible to Hidden (Height increased to 90 for more spacing)
  // 90-150: Buffer Zone
  const diffClamp = Animated.diffClamp(clampedScrollY, 0, 150);

  const headerTranslateY = diffClamp.interpolate({
    inputRange: [0, 90, 150],
    outputRange: [0, -90, -90],
    extrapolate: 'clamp',
  });

  const headerOpacity = diffClamp.interpolate({
    inputRange: [0, 45, 60], // Adjusted fade out range
    outputRange: [1, 0.3, 0],
    extrapolate: 'clamp',
  });

  const [date, setDate] = useState(() => {
    const d = new Date(); d.setMinutes(0); d.setSeconds(0); d.setMilliseconds(0); return d;
  });
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const slideAnim = useRef(new Animated.Value(0)).current;
  const modalScrollRef = useRef<ScrollView>(null);
  const [isNotificationOpen, setIsNotificationOpen] = useState(false);
  const [isRepeatOpen, setIsRepeatOpen] = useState(false);
  const [isSettingsVisible, setIsSettingsVisible] = useState(false);
  const [isAppNotificationEnabled, setIsAppNotificationEnabled] = useState(true);
  /* AI Mode State */
  const [isAiMode, setIsAiMode] = useState(false);
  const [aiPrompt, setAiPrompt] = useState('');

  useEffect(() => {
    const loadData = async () => {
      try {
        const tasksJson = await AsyncStorage.getItem(STORAGE_KEY);
        const metaJson = await AsyncStorage.getItem(META_KEY);
        if (tasksJson != null) {
          const loadedTasks = JSON.parse(tasksJson);
          const parsedTasks = loadedTasks.map((t: any) => ({ ...t, time: new Date(t.time), isCompleted: t.isCompleted || false }));
          setTasks(parsedTasks);
        }
        if (metaJson != null) setCompletedMeta(JSON.parse(metaJson));

        // Load Settings & Theme
        const notiFn = await AsyncStorage.getItem(NOTIFICATION_SETTING_KEY);
        if (notiFn !== null) setIsAppNotificationEnabled(JSON.parse(notiFn));

        const themeData = await AsyncStorage.getItem(THEME_STORAGE_KEY);
        if (themeData) {
          const { bgId, acId } = JSON.parse(themeData);
          if (bgId) {
            setThemeId(bgId);
            // Check if it was our new 'light_mode' id or legacy
            if (bgId === 'light_mode') setBgColor('#f2f2f6');
            else setBgColor(BACKGROUND_OPTIONS.find(o => o.id === bgId)?.color || '#0a0a0a');
          }
          if (acId) {
            setAccentId(acId);
            setAccentColor(ACCENT_OPTIONS.find(o => o.id === acId)?.color || '#7B52FF');
          }
        }
      } catch (e) { console.error(e); }
    }
    loadData();
  }, []);

  useEffect(() => {
    const saveData = async () => { try { await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(tasks)); } catch (e) { console.error(e); } }
    saveData();
  }, [tasks]);

  useEffect(() => {
    const saveMeta = async () => { try { await AsyncStorage.setItem(META_KEY, JSON.stringify(completedMeta)); } catch (e) { console.error(e); } }
    saveMeta();
  }, [completedMeta]);

  /* REMOVED calendarDates in favor of weekDates driven by currentWeekStart */
  const weekDates = useMemo(() => {
    const dates = [];
    for (let i = 0; i < 7; i++) {
      const d = new Date(currentWeekStart);
      d.setDate(currentWeekStart.getDate() + i);
      dates.push(d);
    }
    return dates;
  }, [currentWeekStart]);

  // Handle Swipe Gestures for Weeks
  const panResponder = useMemo(() => PanResponder.create({
    onMoveShouldSetPanResponder: (_, gestureState) => Math.abs(gestureState.dx) > 30, // Sensitivity
    onPanResponderRelease: (_, gestureState) => {
      if (gestureState.dx > 50) {
        // Swipe Right -> Previous Week
        setCurrentWeekStart(prev => {
          const next = new Date(prev);
          next.setDate(prev.getDate() - 7);
          return next;
        });
      } else if (gestureState.dx < -50) {
        // Swipe Left -> Next Week
        setCurrentWeekStart(prev => {
          const next = new Date(prev);
          next.setDate(prev.getDate() + 7);
          return next;
        });
      }
    }
  }), []);

  const onChange = (event: any, selectedDate?: Date) => { const currentDate = selectedDate || date; setDate(currentDate); };

  const [isRepeatChangeModalVisible, setIsRepeatChangeModalVisible] = useState(false);
  const [repeatChangeScope, setRepeatChangeScope] = useState<'single' | 'all'>('single');

  /* AI State */
  const [isAiResultMode, setIsAiResultMode] = useState(false);
  const [isLoadingAi, setIsLoadingAi] = useState(false);
  const [aiResult, setAiResult] = useState<AiResult | null>(null);
  const [aiResultPrompt, setAiResultPrompt] = useState(''); // Store the prompt that generated the result

  /* Reset Modal State */
  const [isResetConfirmationVisible, setIsResetConfirmationVisible] = useState(false);


  /* Notifications Setup */
  useEffect(() => {
    registerForPushNotificationsAsync();
  }, []);

  const registerForPushNotificationsAsync = async () => {
    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync('default', {
        name: 'default',
        importance: Notifications.AndroidImportance.MAX,
        vibrationPattern: [0, 250, 250, 250],
        lightColor: '#FF231F7C',
      });
    }

    // Check permissions on both Device and Simulator for local notifications
    const { status: existingStatus } = await Notifications.getPermissionsAsync();
    let finalStatus = existingStatus;
    if (existingStatus !== 'granted') {
      const { status } = await Notifications.requestPermissionsAsync();
      finalStatus = status;
    }
    if (finalStatus !== 'granted') {
      console.log('Notification permission not granted');
      return;
    }
  };

  const scheduleTaskNotification = async (task: Task) => {
    // Always cancel existing First to avoid duplicates
    await Notifications.cancelScheduledNotificationAsync(task.id);

    // If global notifications are disabled, stop here
    if (!isAppNotificationEnabled) return;

    if (!task.hasTime || !task.notification || task.notification === '안 함') return;

    const taskTime = new Date(task.time);
    if (isNaN(taskTime.getTime())) {
      console.log("Invalid task time:", task.time);
      return;
    }

    let triggerDate = new Date(taskTime);

    switch (task.notification) {
      case '5분 전': triggerDate.setMinutes(triggerDate.getMinutes() - 5); break;
      case '10분 전': triggerDate.setMinutes(triggerDate.getMinutes() - 10); break;
      case '30분 전': triggerDate.setMinutes(triggerDate.getMinutes() - 30); break;
      case '1시간 전': triggerDate.setHours(triggerDate.getHours() - 1); break;
      case '정시': break; // same as taskTime
      default: return; // '안 함' handled above
    }

    const now = Date.now();
    const diff = triggerDate.getTime() - now;

    // Don't schedule if in the past
    if (diff <= 0) {
      console.log("Trigger date is in the past:", triggerDate);
      return;
    }

    const seconds = Math.ceil(diff / 1000);

    try {
      console.log("Scheduling notification for:", task.title, "in seconds:", seconds);
      const bodyText = task.notification === '정시'
        ? `${task.title} 시작 시간입니다.`
        : `${task.title} 시작 ${task.notification} 입니다.`;

      await Notifications.scheduleNotificationAsync({
        identifier: task.id,
        content: {
          title: "할일 알림",
          body: bodyText,
          sound: "default",
        },
        trigger: {
          type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
          seconds: seconds,
          repeats: false,
        },
      });
    } catch (e) {
      console.log("Notification Schedule Error:", e);
      Alert.alert("알림 오류", "스케줄링 실패: " + JSON.stringify(e));
    }
  };

  const processSave = async (scope: 'single' | 'all') => {
    const currentTitle = taskTitle || (selectedTab === 'inbox' ? '새로운 할일' : '새로운 일정');

    // Create Mode
    if (!editingTaskId) {
      const groupId = Date.now().toString();
      const newCreatedTasks = generateAndSaveTasks(groupId, currentTitle);
      // Schedule notifications for newly created tasks (limit to first 60 to avoid OS limits)
      newCreatedTasks.slice(0, 60).forEach(t => scheduleTaskNotification(t));

      resetModal();
      return;
    }

    // Edit Mode
    if (scope === 'single') {
      // Just update this specific task
      setTasks(prev => prev.map(t => {
        if (t.id === editingTaskId) {
          const originalTask = prev.find(i => i.id === editingTaskId);
          const isRepeatChanged = originalTask && originalTask.repeat !== repeat;
          const newGroupId = isRepeatChanged ? Date.now().toString() : t.groupId;

          const updatedTask = {
            ...t,
            title: currentTitle,
            hasTime: isEnabledTime,
            time: date,
            hasDuration: isEnabledDuration,
            duration: selectedDuration,
            tab: selectedTab,
            dateString: selectedTab === 'flow' ? selectedDate.toISOString().split('T')[0] : t.dateString,
            isCompleted: t.isCompleted,
            repeat: repeat,
            groupId: newGroupId,
            notification: notification
          };

          scheduleTaskNotification(updatedTask);
          return updatedTask;
        }
        return t;
      }));
    } else {
      // Scope is 'all'
      const task = tasks.find(t => t.id === editingTaskId);
      const targetGroupId = task?.groupId;

      // 1. Cancel notifications for tasks being deleted
      const tasksToDelete = targetGroupId ? tasks.filter(t => t.groupId === targetGroupId) : (task ? [task] : []);
      for (const t of tasksToDelete) {
        await Notifications.cancelScheduledNotificationAsync(t.id);
      }

      // 2. Delete all with that groupId
      if (targetGroupId) {
        setTasks(prev => prev.filter(t => t.groupId !== targetGroupId));
      } else {
        setTasks(prev => prev.filter(t => t.id !== editingTaskId));
      }

      // 3. Generate new tasks with current settings
      const newGroupId = Date.now().toString();
      const generatedTasks = generateAndSaveTasks(newGroupId, currentTitle);
      generatedTasks.slice(0, 60).forEach(t => scheduleTaskNotification(t));
    }

    resetModal();
  };

  const generateAndSaveTasks = (groupId: string, currentTitle: string) => {
    const newTasks: Task[] = [];
    const startDate = new Date(selectedDate);
    const limitDate = new Date(startDate);
    limitDate.setFullYear(limitDate.getFullYear() + 1); // 1 year limit

    const createNewTask = (taskDate: Date) => {
      const timeForTask = new Date(taskDate);
      timeForTask.setHours(date.getHours());
      timeForTask.setMinutes(date.getMinutes());

      return {
        id: `${groupId}_${taskDate.getTime()}_${Math.random().toString(36).substr(2, 9)} `,
        title: currentTitle,
        hasTime: isEnabledTime,
        time: timeForTask,
        hasDuration: isEnabledDuration,
        duration: selectedDuration,
        tab: selectedTab,
        createdAt: Date.now(), // Same creation time for sorting
        dateString: getYYYYMMDD(taskDate),
        isCompleted: false,
        repeat: repeat,
        groupId: groupId,
        notification: notification
      };
    };

    if (selectedTab === 'inbox' || repeat === '안 함') {
      newTasks.push(createNewTask(startDate));
    } else if (repeat === '매달') {
      const targetDay = startDate.getDate();
      for (let i = 0; i < 12; i++) {
        const nextYear = startDate.getFullYear();
        const nextMonth = startDate.getMonth() + i;

        // Handle month days (e.g. 31st -> 30th/28th)
        const daysInMonth = new Date(nextYear, nextMonth + 1, 0).getDate();
        const finalDay = Math.min(targetDay, daysInMonth);
        const finalDate = new Date(nextYear, nextMonth, finalDay);

        if (finalDate > limitDate) break;
        newTasks.push(createNewTask(finalDate));
      }
    } else {
      // Daily, Weekdays, Weekends, Weekly
      let current = new Date(startDate);
      const startDayVal = startDate.getDay();

      while (current <= limitDate) {
        let shouldAdd = false;
        const day = current.getDay();

        switch (repeat) {
          case '매일':
            shouldAdd = true;
            break;
          case '평일(월~금)':
            if (day >= 1 && day <= 5) shouldAdd = true;
            break;
          case '주말(토~일)':
            if (day === 0 || day === 6) shouldAdd = true;
            break;
          case '매주':
            if (day === startDayVal) shouldAdd = true;
            break;
        }

        if (shouldAdd) {
          newTasks.push(createNewTask(new Date(current)));
        }
        current.setDate(current.getDate() + 1);
      }
    }

    setTasks(prev => [...prev, ...newTasks]);
    return newTasks; // Return for notification scheduling
  };

  const [aiEditingIndex, setAiEditingIndex] = useState<number | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  /* Toast Logic */
  useEffect(() => {
    if (toastMessage) {
      const timer = setTimeout(() => {
        setToastMessage(null);
      }, 2000);
      return () => clearTimeout(timer);
    }
  }, [toastMessage]);

  const handleAiTaskAdd = (task: AiTask) => {
    const groupId = Date.now().toString();
    const taskDate = new Date(selectedDate);

    // Time setting
    let hasTime = false;
    let timeObj = new Date(taskDate);
    if (task.time) {
      const [h, m] = task.time.split(':').map(Number);
      if (!isNaN(h) && !isNaN(m)) {
        timeObj.setHours(h, m, 0, 0);
        hasTime = true;
      }
    }

    const newTask: Task = {
      id: `${groupId}_ai_${Math.random().toString(36).substr(2, 9)}`,
      title: task.title,
      hasTime: hasTime,
      time: timeObj,
      hasDuration: !!task.duration,
      duration: task.duration || '1시간',
      tab: 'flow',
      createdAt: Date.now(),
      dateString: getYYYYMMDD(taskDate),
      isCompleted: false,
      repeat: task.repeat || '안 함',
      groupId: groupId,
      notification: '안 함'
    };

    setTasks(prev => [...prev, newTask]);
    setToastMessage(`${task.title} 일정이 추가되었습니다.`);
  };

  const _unused_handleAiTaskAdd = (task: AiTask) => {
    const today = new Date();
    today.setHours(0, 0, 0, 0); // Default to today/selectedDate? 
    // User requested: "Add to schedule". 
    // If AI task has time, use it on the selectedDate or today?
    // Let's assume selectedDate if set, or today.

    let taskDate = new Date(selectedDate);
    if (task.time) {
      const [h, m] = task.time.split(':').map(Number);
      if (!isNaN(h) && !isNaN(m)) {
        taskDate.setHours(h, m, 0, 0);
      }
    }

    const newTask = {
      id: Date.now().toString() + Math.random().toString(36).substr(2, 9),
      title: task.title,
      isCompleted: false,
      date: getYYYYMMDD(taskDate), // Assuming 'date' field is string YYYY-MM-DD based on existing code? 
      // Wait, let's check createNewTask structure.
      // Based on createNewTask: id, title, isCompleted, date (Date object?), groupId...
      // I need to verify Task interface.
      // Looking at `handleSaveTask`, it updates `completedMeta` for wake/sleep, but for regular tasks?
      // `createNewTask` usage line 702: `newTasks.push(createNewTask(new Date(current)));`
      // I need to see `createNewTask` definition.
    };

    // I better check createNewTask definition first to be safe. 
    // Just putting placeholders here.

    // Wait, I should view createNewTask first in next step or now? 
    // I can't see it in currently viewed lines properly. 
    // It calls `createNewTask`.
  };

  const handleAiTaskEdit = (task: AiTask, index: number) => {
    setAiEditingIndex(index);
    setTaskTitle(task.title);

    if (task.time) {
      setIsEnabledTime(true);
      const [h, m] = task.time.split(':').map(Number);
      const newDate = new Date();
      newDate.setHours(h, m, 0, 0);
      setDate(newDate);
    } else {
      setIsEnabledTime(false);
      setDate(new Date());
    }

    if (task.duration) {
      setIsEnabledDuration(true);
      setSelectedDuration(task.duration);
    } else {
      setIsEnabledDuration(false);
      setSelectedDuration('1시간');
    }

    if (task.repeat) {
      setRepeat(task.repeat);
    } else {
      setRepeat('안 함');
    }

    setEditingTaskId('');
    setIsAiResultMode(false);
    setTimeout(() => setModalVisible(true), 200);
  };

  const handleSaveTask = () => {
    if (aiEditingIndex !== null && aiResult) {
      // Update the task within aiResult
      const updatedTasks = [...aiResult.tasks];
      updatedTasks[aiEditingIndex] = {
        ...updatedTasks[aiEditingIndex],
        title: taskTitle,
        time: isEnabledTime ? formatTime(date) : undefined, // Format: HH:MM
        duration: isEnabledDuration ? selectedDuration : undefined,
        repeat: repeat
      };

      setAiResult({
        ...aiResult,
        tasks: updatedTasks
      });

      resetModal();
      return;
    }

    if (editingTaskId === 'wake' || editingTaskId === 'sleep') {
      const dateStr = getYYYYMMDD(selectedDate);
      const titleKey = `${dateStr}_${editingTaskId} _title`;
      const hasTimeKey = `${dateStr}_${editingTaskId} _hasTime`;
      const timeKey = `${dateStr}_${editingTaskId} _time`;
      const notificationKey = `${dateStr}_${editingTaskId} _notification`;

      setCompletedMeta(prev => ({
        ...prev,
        [titleKey]: taskTitle,
        [hasTimeKey]: isEnabledTime,
        [timeKey]: date.toISOString(),
        [notificationKey]: notification
      }));

      // Schedule Notification logic
      const notificationId = `${dateStr}_${editingTaskId} `;
      if (isEnabledTime && notification && notification !== '안 함') {
        const pseudoTask: any = {
          id: notificationId,
          title: taskTitle,
          hasTime: isEnabledTime,
          time: date,
          notification: notification,
          dateString: dateStr,
        };
        scheduleTaskNotification(pseudoTask);
      } else {
        Notifications.cancelScheduledNotificationAsync(notificationId);
      }

      resetModal();
      return;
    }

    if (editingTaskId) {
      const originalTask = tasks.find(t => t.id === editingTaskId);
      // Check if repeating task and if repeat option changed
      const isRecurring = originalTask?.groupId && originalTask.repeat !== '안 함';
      const isRepeatChanged = originalTask && originalTask.repeat !== repeat;

      if (isRecurring && isRepeatChanged) {
        setRepeatChangeScope('single'); // default
        setIsRepeatChangeModalVisible(true);
        return;
      }
    }
    processSave('single');
  };

  const handleDeleteTask = async (taskId?: string) => {
    const idToDelete = taskId || editingTaskId;
    if (!idToDelete) return;

    // Determine current repeat status
    let repeatStatus = '안 함';
    if (taskId && taskId !== editingTaskId) {
      const t = tasks.find(i => i.id === taskId);
      if (t && t.repeat) repeatStatus = t.repeat;
    } else {
      repeatStatus = repeat;
    }

    const performDelete = async (deleteMode: 'single' | 'all') => {
      if (deleteMode === 'single') {
        // Delete just this specific task ID
        await Notifications.cancelScheduledNotificationAsync(idToDelete);
        setTasks(prev => prev.filter(t => t.id !== idToDelete));
      } else {
        // Delete all related tasks using groupId
        const task = tasks.find(t => t.id === idToDelete);
        const targetGroupId = task?.groupId;

        if (targetGroupId) {
          const tasksToDelete = tasks.filter(t => t.groupId === targetGroupId);
          for (const t of tasksToDelete) {
            await Notifications.cancelScheduledNotificationAsync(t.id);
          }
          setTasks(prev => prev.filter(t => t.groupId !== targetGroupId));
        } else {
          // Fallback if no groupId (legacy tasks methods)
          await Notifications.cancelScheduledNotificationAsync(idToDelete);
          setTasks(prev => prev.filter(t => t.id !== idToDelete));
        }
      }

      if (taskId && taskId !== editingTaskId) {
        closeShortcutMenu();
      } else {
        resetModal();
      }
    };

    if (repeatStatus === '안 함' || repeatStatus === '한번') {
      await performDelete('single');
    } else {
      Alert.alert(
        "반복 일정 삭제",
        "삭제 범위를 선택해주세요.",
        [
          { text: "취소", style: "cancel" },
          {
            text: "이 일정만 삭제",
            onPress: () => performDelete('single')
          },
          {
            text: "모든 일정 삭제",
            style: "destructive",
            onPress: () => performDelete('all')
          }
        ]
      );
    }
  };


  const handleTestNotification = async () => {
    try {
      if (!isAppNotificationEnabled) {
        Alert.alert("알림 꺼짐", "앱 알림 설정이 꺼져있어 테스트를 할 수 없습니다.");
        return;
      }

      await Notifications.scheduleNotificationAsync({
        content: {
          title: "테스트 알림",
          body: "알림이 정상적으로 작동합니다! 🎉",
          sound: "default",
        },
        trigger: null,
      });
      Alert.alert("알림 발송", "테스트 알림이 즉시 발송됩니다.");
    } catch (e) {
      console.log("Test Notification Error:", e);
      Alert.alert("오류", "알림 스케줄링 중 오류가 발생했습니다.");
    }
  };

  /* Toggle App Notification Setting */
  /* Toggle App Notification Setting */
  const handleToggleNotification = async (value: boolean) => {
    if (value) {
      // Check permissions first
      const { status: existingStatus } = await Notifications.getPermissionsAsync();
      let finalStatus = existingStatus;
      if (existingStatus !== 'granted') {
        const { status } = await Notifications.requestPermissionsAsync();
        finalStatus = status;
      }

      if (finalStatus !== 'granted') {
        Alert.alert("권한 필요", "알림 기능을 사용하려면 설정에서 알림 권한을 허용해주세요.");
        setIsAppNotificationEnabled(false);
        return;
      }

      setIsAppNotificationEnabled(true);
      await AsyncStorage.setItem(NOTIFICATION_SETTING_KEY, 'true');

      // Enabled: Reschedule for all future tasks
      const futureTasks = tasks.filter(t => t.hasTime && t.notification && t.notification !== '안 함');
      futureTasks.slice(0, 60).forEach(t => scheduleTaskNotification(t));
      Alert.alert("알림", "알림이 켜졌습니다.");
    } else {
      setIsAppNotificationEnabled(false);
      await AsyncStorage.setItem(NOTIFICATION_SETTING_KEY, 'false');

      // Disabled: Cancel all
      await Notifications.cancelAllScheduledNotificationsAsync();
      Alert.alert("알림", "알림이 꺼졌습니다.");
    }
  };

  const handleTaskPress = (taskId: string) => { setSelectedTaskId(taskId); Animated.timing(slideAnim, { toValue: 1, duration: 300, useNativeDriver: true }).start(); };
  const closeShortcutMenu = () => { Animated.timing(slideAnim, { toValue: 0, duration: 200, useNativeDriver: true }).start(() => setSelectedTaskId(null)); };

  const handleShortcutAction = (action: 'edit' | 'delete' | 'complete') => {
    if (!selectedTaskId) return;
    if (action === 'edit') {
      if (selectedTaskId === 'wake' || selectedTaskId === 'sleep') {
        const dateStr = getYYYYMMDD(selectedDate);
        const titleKey = `${dateStr}_${selectedTaskId} _title`;
        const hasTimeKey = `${dateStr}_${selectedTaskId} _hasTime`;
        const timeKey = `${dateStr}_${selectedTaskId} _time`;
        const notificationKey = `${dateStr}_${selectedTaskId} _notification`;

        const currentTitle = completedMeta[titleKey] || (selectedTaskId === 'wake' ? '기상' : '취침');
        const currentHasTime = completedMeta[hasTimeKey] || false;
        const currentTime = completedMeta[timeKey] ? new Date(completedMeta[timeKey]) : new Date();
        const currentNotification = completedMeta[notificationKey] || '안 함';

        setTaskTitle(currentTitle);
        setIsEnabledTime(currentHasTime);
        setDate(currentTime);
        setNotification(currentNotification);

        // Reset others
        setIsEnabledDuration(false);
        setRepeat('안 함');

        setEditingTaskId(selectedTaskId);
        setModalVisible(true);
        closeShortcutMenu();
      } else {
        const task = tasks.find(t => t.id === selectedTaskId);
        if (task) openEditModal(task);
        else closeShortcutMenu();
      }
    }
    else if (action === 'delete') { if (selectedTaskId !== 'wake' && selectedTaskId !== 'sleep') handleDeleteTask(selectedTaskId); }
    else if (action === 'complete') {
      if (selectedTaskId === 'wake' || selectedTaskId === 'sleep') { const key = `${getYYYYMMDD(selectedDate)}_${selectedTaskId} `; setCompletedMeta(prev => ({ ...prev, [key]: !prev[key] })); }
      else { setTasks(prev => prev.map(t => t.id === selectedTaskId ? { ...t, isCompleted: !t.isCompleted } : t)); }
      closeShortcutMenu();
    }
  };

  const resetModal = () => {
    setTaskTitle('');
    setIsEnabledTime(false);
    setIsEnabledDuration(false);
    /* Reset picker visibility */
    setIsTimePickerOpen(false);
    setIsDurationPickerOpen(false);
    setNotification('안 함');
    setRepeat('안 함');
    setEditingTaskId(null);
    setModalVisible(false);
    setIsRepeatChangeModalVisible(false);

    if (aiEditingIndex !== null) {
      setTimeout(() => setIsAiResultMode(true), 200);
      setAiEditingIndex(null);
    }
  };
  const openEditModal = (task: Task) => {
    closeShortcutMenu();
    setTaskTitle(task.title);
    setIsEnabledTime(task.hasTime);
    /* If enabled, verify if we want it open by default? Usually editing doesn't auto-open pickers unless requested. Let's start closed to keep UI clean, or open if it was the main focus? Closed is safer/cleaner. */
    setIsTimePickerOpen(false);
    setDate(new Date(task.time));
    setIsEnabledDuration(task.hasDuration);
    setIsDurationPickerOpen(false);
    setSelectedDuration(task.duration);
    setSelectedTab(task.tab);
    setEditingTaskId(task.id);
    setNotification(task.notification || '안 함');
    setRepeat(task.repeat || '안 함');
    setModalVisible(true);
    setInboxVisible(false);
  };

  const handleInboxTaskClick = (task: Task) => {
    const targetDateStr = getYYYYMMDD(selectedDate);
    const updatedTask = {
      ...task,
      tab: 'flow' as const,
      dateString: targetDateStr,
      createdAt: Date.now() // Update to ensure it stacks at the bottom of untimed tasks
    };
    setTasks(prev => prev.map(t => t.id === task.id ? updatedTask : t));
    setInboxVisible(false);
  };

  const flowTasks = useMemo(() => { const targetDateStr = getYYYYMMDD(selectedDate); const daysTasks = tasks.filter(t => t.tab === 'flow' && t.dateString === targetDateStr); const timed = daysTasks.filter(t => t.hasTime); const untimed = daysTasks.filter(t => !t.hasTime); timed.sort((a, b) => new Date(a.time).getTime() - new Date(b.time).getTime()); untimed.sort((a, b) => a.createdAt - b.createdAt); return { timed, untimed }; }, [tasks, selectedDate]);

  // OPTIMIZATION: Memoize the data array for DragList to prevent re-renders when other state (like modal tabs) changes.
  const draggableData = useMemo(() => [...flowTasks.timed, ...flowTasks.untimed], [flowTasks]);

  const inboxTasks = useMemo(() => { return tasks.filter(t => t.tab === 'inbox'); }, [tasks]);
  const displayedInboxTasks = useMemo(() => { const sorted = [...inboxTasks].sort((a, b) => a.createdAt - b.createdAt); return sorted.slice(0, inboxPage * 15); }, [inboxTasks, inboxPage]);

  const formatTime = (date: Date) => { let hours = date.getHours(); const minutes = date.getMinutes(); const ampm = hours >= 12 ? '오후' : '오전'; hours = hours % 12; hours = hours ? hours : 12; const minutesStr = minutes > 0 ? ` ${minutes} 분` : ''; return `${ampm} ${hours}시${minutesStr} `; };
  const formatFlowTime = (date: Date) => {
    let hours = date.getHours();
    const minutes = date.getMinutes();
    const ampm = hours >= 12 ? '오후' : '오전';
    hours = hours % 12;
    hours = hours ? hours : 12;
    const hoursStr = hours < 10 ? `0${hours} ` : `${hours} `;
    const minutesStr = minutes < 10 ? `0${minutes} ` : `${minutes} `;
    return `${ampm} ${hoursStr}시 ${minutesStr} 분`;
  }

  // Pre-calculate stats for the calendar range to avoid O(N*M) in render
  const taskStats = useMemo(() => {
    const stats: { [key: string]: { total: number, completed: number } } = {};
    tasks.forEach(t => {
      if (t.tab === 'flow') {
        if (!stats[t.dateString]) stats[t.dateString] = { total: 0, completed: 0 };
        stats[t.dateString].total += 1;
        if (t.isCompleted) stats[t.dateString].completed += 1;
      }
    });
    return stats;
  }, [tasks]);

  const handleDatePress = useCallback((item: Date) => {
    setSelectedDate(item);
    if (selectedTaskId) closeShortcutMenu();
  }, [selectedTaskId]);

  const renderDateItem = useCallback(({ item }: { item: Date }) => {
    const dateStr = getYYYYMMDD(item);
    // Use pre-calculated stats or default
    const dayStats = taskStats[dateStr] || { total: 0, completed: 0 };
    const wakeCompleted = !!completedMeta[`${dateStr} _wake`];
    const sleepCompleted = !!completedMeta[`${dateStr} _sleep`];

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const isDisabled = isAiMode && item < today;

    return (
      <DateItem
        item={item}
        selectedDate={selectedDate}
        stats={dayStats}
        wakeCompleted={!!completedMeta[`${getYYYYMMDD(item)} _wake`]}
        sleepCompleted={!!completedMeta[`${getYYYYMMDD(item)} _sleep`]}
        accentColor={accentColor}
        onPress={handleDatePress}
        disabled={isDisabled}
      />
    );
  }, [selectedDate, taskStats, completedMeta, handleDatePress, accentColor, isAiMode]);

  const currentWakeKey = `${getYYYYMMDD(selectedDate)} _wake`; const isWakeCompleted = completedMeta[currentWakeKey]; const currentSleepKey = `${getYYYYMMDD(selectedDate)} _sleep`; const isSleepCompleted = completedMeta[currentSleepKey];
  const openTaskModalFromInbox = () => { setTaskTitle(''); setIsEnabledTime(false); setIsEnabledDuration(false); setEditingTaskId(null); setDate(new Date()); setInboxVisible(false); setSelectedTab('inbox'); setModalVisible(true); };
  const openNewTaskModal = () => { setTaskTitle(''); setIsEnabledTime(false); setIsEnabledDuration(false); setEditingTaskId(null); setDate(new Date()); setSelectedTab('flow'); setModalVisible(true); }


  /* OPTIMIZATION: Memoize handlers to prevent DragList re-renders on modal updates */
  const onDragListReordered = useCallback(async (fromIndex: number, toIndex: number) => {
    const targetDateStr = getYYYYMMDD(selectedDate);
    const daysTasks = tasks.filter(t => t.tab === 'flow' && t.dateString === targetDateStr);
    const allRenderedNodes = [...flowTasks.timed, ...flowTasks.untimed];
    const item = allRenderedNodes[fromIndex];

    if (!item) return;

    // Sort existing UNTIMED tasks to find correct insertion point
    const otherUntimed = daysTasks
      .filter(t => !t.hasTime && t.id !== item.id)
      .sort((a, b) => a.createdAt - b.createdAt);

    // Count timed tasks to determine offset
    const timedCount = daysTasks.filter(t => t.hasTime && t.id !== item.id).length;

    let relativeIndex = toIndex - timedCount;
    // Clamp index
    if (relativeIndex < 0) relativeIndex = 0;
    if (relativeIndex > otherUntimed.length) relativeIndex = otherUntimed.length;

    let newCreatedAt = Date.now();

    if (otherUntimed.length === 0) {
      newCreatedAt = Date.now();
    } else if (relativeIndex === 0) {
      // Top of untimed list
      newCreatedAt = otherUntimed[0].createdAt - 60000;
    } else if (relativeIndex >= otherUntimed.length) {
      // Bottom of untimed list
      newCreatedAt = otherUntimed[otherUntimed.length - 1].createdAt + 60000;
    } else {
      // Between two untimed tasks
      const prev = otherUntimed[relativeIndex - 1];
      const next = otherUntimed[relativeIndex];
      newCreatedAt = (prev.createdAt + next.createdAt) / 2;
    }

    const updatedTask = {
      ...item,
      hasTime: false,
      createdAt: newCreatedAt,
      tab: 'flow' as const,
      dateString: targetDateStr
    };

    setTasks(prevTasks => {
      const otherTasks = prevTasks.filter(t => t.id !== item.id);
      return [...otherTasks, updatedTask];
    });

    if (selectedTaskId) closeShortcutMenu();
  }, [tasks, flowTasks, selectedDate, selectedTaskId]);

  const renderDragListItem = useCallback(({ item, onDragStart, onDragEnd, isActive }: DragListRenderItemInfo<Task>) => {
    const allNodes = [...flowTasks.timed, ...flowTasks.untimed];
    const index = allNodes.findIndex(t => t.id === item.id);
    return (
      <View style={{ alignItems: 'center', opacity: isActive ? 0.5 : 1 }}>
        <TouchableOpacity
          onPress={(e) => { e.stopPropagation(); handleTaskPress(item.id); }}
          onLongPress={onDragStart}
          delayLongPress={200}
          style={[
            styles.flowNode,
            { backgroundColor: item.isCompleted ? accentColor : '#1c1c1e', padding: 10, height: 'auto', minHeight: 100, aspectRatio: 1, borderColor: item.isCompleted ? accentColor : 'rgba(255,255,255,0.1)' },
            selectedTaskId === item.id && styles.selectedFlowNode,
            (selectedTaskId === item.id && item.isCompleted) && { borderColor: '#fff' }
          ]}
        >
          {item.hasTime && <Text style={{ color: item.isCompleted ? '#ddd' : '#666', fontSize: 13, marginBottom: 4 }}>{formatFlowTime(new Date(item.time))}</Text>}
          <Text
            style={[styles.flowNodeText, { fontSize: 20 }, item.isCompleted && styles.completedNodeText]}
            numberOfLines={2}
            ellipsizeMode="tail"
          >
            {item.title}
          </Text>
          {item.hasDuration && <Text style={{ color: item.isCompleted ? '#ddd' : '#666', fontSize: 13, marginTop: 4 }}>{item.duration}동안</Text>}
        </TouchableOpacity>
        <DropArrow
          highlighted={false}
        />
      </View>
    );
  }, [flowTasks, selectedTaskId, accentColor]);

  /* DEBUG: Reset Data */
  const handleResetData = () => {
    setIsResetConfirmationVisible(true);
  };

  const confirmResetData = async () => {
    try {
      await AsyncStorage.multiRemove([STORAGE_KEY, META_KEY]);
      setTasks([]);
      setCompletedMeta({});
      setIsResetConfirmationVisible(false);
      Alert.alert("알림", "데이터가 초기화되었습니다.");
    } catch (e) {
      console.error(e);
      Alert.alert("오류", "초기화 중 오류가 발생했습니다.");
    }
  };

  /* AI Logic */
  const fetchAiRecommendation = async (prompt: string) => {
    if (!prompt.trim()) return;

    setIsLoadingAi(true);
    setAiResultPrompt(prompt);
    /* Close keyboard */
    Keyboard.dismiss();

    try {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-3-flash-preview:generateContent?key=${GEMINI_API_KEY}`;
      const systemInstruction = `
      You are a helpful assistant. Analyze the user's plan and provide a JSON response with:
      1. 'comment': A warm, encouraging short comment (Korean).
      2. 'tasks': A list of tasks. Each task has:
         - 'title': Name of task.
         - 'time': (Optional) specifically if user mentioned time (HH:MM format).
         - 'duration': Estimate duration strictly from this list: ["10분", "15분", "30분", "1시간", "1.5시간", "2시간", "2.5시간", "3시간", "3.5시간", "4시간"].
         - 'repeat': Suggest repetition strictly from: ["안 함", "매일", "평일(월~금)", "주말(토~일)", "매주", "매달"].
      
      Response Format:
      {
        "comment": "...",
        "tasks": [ ... ]
      }
      `;

      const apiBody = {
        contents: [{
          parts: [{
            text: systemInstruction + "\nUser Input: " + prompt
          }]
        }]
      };

      const response = await axios.post(url, apiBody);
      const text = response.data?.candidates?.[0]?.content?.parts?.[0]?.text;

      if (text) {
        // Parse JSON from text (handle potential markdown code blocks)
        const cleanText = text.replace(/```json/g, '').replace(/```/g, '').trim();
        const jsonResult = JSON.parse(cleanText) as AiResult;
        setAiResult(jsonResult);
        setIsAiResultMode(true);
      }
    } catch (error) {
      console.error("AI Error:", error);
      Alert.alert("오류", "AI 추천을 가져오는 중 오류가 발생했습니다.");
    } finally {
      setIsLoadingAi(false);
    }
  };


  /* AI Placeholder Logic */
  const aiPlaceholderText = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const target = new Date(selectedDate);
    target.setHours(0, 0, 0, 0);

    const diffTime = target.getTime() - today.getTime();
    const diffDays = Math.round(diffTime / (1000 * 60 * 60 * 24));

    if (diffDays === 0) return "오늘 계획을\n세워보세요";
    if (diffDays === 1) return "내일 계획을\n세워보세요";

    // Check if target is within THIS week (the week that CURRENTLY contains today)
    const thisWeekMonday = getMonday(today);
    const nextWeekMonday = new Date(thisWeekMonday);
    nextWeekMonday.setDate(thisWeekMonday.getDate() + 7);

    if (target.getTime() >= thisWeekMonday.getTime() && target.getTime() < nextWeekMonday.getTime()) {
      return `${DAYS_KR[target.getDay()]}요일 계획을\n세워보세요`;
    }

    return `${target.getMonth() + 1}월 ${target.getDate()}일 계획을\n세워보세요`;
  }, [selectedDate]);

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: bgColor }]} edges={['top', 'left', 'right']}>
      <StatusBar style="light" />

      {/* Collapsible Header Area */}
      <Animated.View style={{
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        zIndex: 50,
        backgroundColor: bgColor,
        transform: [{ translateY: isAiMode ? 0 : headerTranslateY }]
      }}>
        {/* Date Header */}
        <Animated.View style={{
          height: 90,
          paddingHorizontal: 20,
          justifyContent: 'flex-end',
          paddingBottom: 16,
          opacity: isAiMode ? 1 : headerOpacity,
          transform: [{
            translateY: isAiMode ? 0 : diffClamp.interpolate({
              inputRange: [0, 90, 150],
              outputRange: [0, -20, -20],
              extrapolate: 'clamp'
            })
          }]
        }}>
          <Text style={{ fontSize: 24, fontWeight: 'bold', color: '#fff' }}>
            {selectedDate.getFullYear()}년 {selectedDate.getMonth() + 1}월
          </Text>
        </Animated.View>

        {/* Weekly Calendar (Fixed below header) */}
        <View style={[styles.calendarContainer, { backgroundColor: bgColor, borderBottomColor: bgColor === '#000000' ? '#111' : '#1c1c1e' }]} {...panResponder.panHandlers}>
          <View style={{ flexDirection: 'row', width: '100%', justifyContent: 'space-between' }}>
            {weekDates.map((item) => (
              <View key={item.toISOString()} style={{ width: ITEM_WIDTH }}>
                {renderDateItem({ item })}
              </View>
            ))}
          </View>
        </View>
      </Animated.View>

      <View style={{ flex: 1 }}>
        {isAiMode && (<>
          <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
            style={[StyleSheet.absoluteFill, { zIndex: 20, backgroundColor: bgColor, paddingTop: 180 }]}
          >
            <View style={{ position: 'absolute', top: 190, left: 20, zIndex: 50 }}>
              <TouchableOpacity
                style={{
                  width: 44, height: 44, borderRadius: 22, backgroundColor: '#1c1c1e',
                  alignItems: 'center', justifyContent: 'center',
                  borderWidth: 1, borderColor: '#333'
                }}
                onPress={() => setIsAiMode(false)}
              >
                <Feather name="chevron-left" size={24} color="#fff" />
              </TouchableOpacity>
            </View>
            <TouchableWithoutFeedback onPress={() => { Keyboard.dismiss(); if (aiPrompt === '') setIsAiMode(false); }}>
              <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
                <Text style={{ color: '#fff', fontSize: 24, fontWeight: 'bold', textAlign: 'center', lineHeight: 36 }}>{aiPlaceholderText}</Text>
              </View>
            </TouchableWithoutFeedback>
            <View style={{ paddingHorizontal: 20, paddingBottom: 40 }}>
              <View style={{
                backgroundColor: 'transparent',
                borderRadius: 24,
                overflow: 'hidden',
                borderWidth: 1.5,
                borderColor: 'rgba(255, 255, 255, 0.2)',
                minHeight: 50,
                flexDirection: 'row',
                alignItems: 'flex-end',
                padding: 5,
                paddingHorizontal: 15
              }}>
                <BlurView
                  intensity={50}
                  tint="dark"
                  style={StyleSheet.absoluteFill}
                />
                <View style={{
                  ...StyleSheet.absoluteFillObject,
                  backgroundColor: 'rgba(25, 25, 30, 0.5)',
                }} />
                <TextInput
                  style={{ flex: 1, color: '#fff', fontSize: 16, maxHeight: 100, paddingVertical: 12, marginRight: 10 }}
                  placeholder="계획을 말해보세요"
                  placeholderTextColor="#666"
                  multiline
                  value={aiPrompt}
                  onChangeText={setAiPrompt}
                  autoFocus={!isAiResultMode}
                  editable={!isLoadingAi}
                />
                <TouchableOpacity
                  style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: aiPrompt.trim() ? '#fff' : '#333', alignItems: 'center', justifyContent: 'center', marginBottom: 6 }}
                  onPress={() => fetchAiRecommendation(aiPrompt)}
                  disabled={isLoadingAi || !aiPrompt.trim()}
                >
                  {isLoadingAi ? <ActivityIndicator color="#000" size="small" /> : <Feather name="arrow-up" size={20} color={aiPrompt.trim() ? '#000' : '#666'} />}
                </TouchableOpacity>
              </View>
            </View>
          </KeyboardAvoidingView>
          {/* AI Result Modal */}
          <Modal
            visible={isAiResultMode && !!aiResult}
            animationType="slide"
            presentationStyle="pageSheet"
            onRequestClose={() => { setIsAiResultMode(false); setAiResult(null); }}
          >
            <View style={{ flex: 1, backgroundColor: '#000' }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, paddingTop: 60, paddingBottom: 20 }}>
                {/* Back Button */}
                <TouchableOpacity
                  style={{
                    width: 44, height: 44, borderRadius: 22, backgroundColor: '#1c1c1e',
                    alignItems: 'center', justifyContent: 'center',
                    borderWidth: 1, borderColor: '#333'
                  }}
                  onPress={() => { setIsAiResultMode(false); setAiResult(null); }}
                >
                  <Feather name="chevron-left" size={24} color="#fff" />
                </TouchableOpacity>

                {/* Close Button */}
                <TouchableOpacity
                  style={{
                    width: 44, height: 44, borderRadius: 22, backgroundColor: '#1c1c1e',
                    alignItems: 'center', justifyContent: 'center',
                    borderWidth: 1, borderColor: '#333'
                  }}
                  onPress={() => {
                    setIsAiMode(false);
                    setIsAiResultMode(false);
                    setAiResult(null);
                  }}
                >
                  <Feather name="x" size={24} color="#fff" />
                </TouchableOpacity>
              </View>

              <ScrollView style={{ flex: 1, paddingHorizontal: 20 }} contentContainerStyle={{ paddingBottom: 50 }}>


                {/* User Input Bubble */}
                <View style={{
                  backgroundColor: '#1c1c1e', borderRadius: 24, padding: 20, marginBottom: 20,
                  borderWidth: 1, borderColor: '#333', alignSelf: 'flex-end', borderBottomRightRadius: 4
                }}>
                  <Text style={{ color: '#fff', fontSize: 16, lineHeight: 24 }}>{aiResultPrompt}</Text>
                </View>

                {/* AI Comment Bubble */}
                <View style={{
                  backgroundColor: '#1c1c1e', borderRadius: 24, padding: 20, marginBottom: 30,
                  borderWidth: 1, borderColor: '#333', alignSelf: 'flex-start', borderTopLeftRadius: 4
                }}>
                  <Text style={{ color: '#ddd', fontSize: 16, lineHeight: 24 }}>{aiResult?.comment}</Text>
                </View>

                {/* Recommended Tasks */}
                <View style={{ gap: 12 }}>
                  {aiResult?.tasks.map((task, index) => (
                    <View key={index} style={{
                      backgroundColor: '#1c1c1e', borderRadius: 24, padding: 20,
                      flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
                      borderWidth: 1, borderColor: '#333'
                    }}>
                      <View>
                        {task.time && <Text style={{ color: '#888', fontSize: 13, marginBottom: 4 }}>{task.time}</Text>}
                        <Text style={{ color: '#fff', fontSize: 20, fontWeight: '600', marginBottom: 4 }}>{task.title}</Text>
                        <Text style={{ color: '#666', fontSize: 13 }}>{task.duration}동안</Text>
                      </View>
                      <View style={{ flexDirection: 'row', gap: 10 }}>
                        <TouchableOpacity
                          style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: '#2c2c2e', alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: '#444' }}
                          onPress={() => handleAiTaskEdit(task, index)}
                        >
                          <Feather name="edit-2" size={20} color="#bbb" />
                        </TouchableOpacity>
                        <TouchableOpacity
                          style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: '#2c2c2e', alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: '#444' }}
                          onPress={() => handleAiTaskAdd(task)}
                        >
                          <Feather name="plus" size={24} color="#bbb" />
                        </TouchableOpacity>
                      </View>
                    </View>
                  ))}
                </View>
              </ScrollView>
              {/* Toast Message inside Modal */}
              {toastMessage && (
                <View style={{ position: 'absolute', bottom: 50, alignSelf: 'center', backgroundColor: '#333', paddingHorizontal: 20, paddingVertical: 10, borderRadius: 20, zIndex: 100 }}>
                  <Text style={{ color: '#fff', fontSize: 14 }}>{toastMessage}</Text>
                </View>
              )}
            </View>
          </Modal>
        </>
        )}
        {selectedTaskId && (
          <Pressable
            style={[StyleSheet.absoluteFill, { zIndex: 10, backgroundColor: 'transparent' }]}
            onPress={() => closeShortcutMenu()}
          />
        )}
        <DragList
          data={draggableData}
          keyExtractor={(item) => item.id}
          onReordered={onDragListReordered}
          renderItem={renderDragListItem}
          ListHeaderComponent={
            <View style={{ alignItems: 'center', paddingTop: 100 }}>
              <TouchableOpacity
                style={[
                  styles.flowNode,
                  isWakeCompleted && { backgroundColor: accentColor, borderColor: accentColor },
                  selectedTaskId === 'wake' && styles.selectedFlowNode,
                  (selectedTaskId === 'wake' && isWakeCompleted) && { borderColor: '#fff' } // Highlight border for completed & selected
                ]}
                onPress={(e) => { e.stopPropagation(); handleTaskPress('wake'); }}
              >
                {completedMeta[`${getYYYYMMDD(selectedDate)} _wake_hasTime`] && (
                  <Text style={{ color: isWakeCompleted ? '#ddd' : '#666', fontSize: 13, marginBottom: 4 }}>
                    {formatFlowTime(new Date(completedMeta[`${getYYYYMMDD(selectedDate)} _wake_time`]))}
                  </Text>
                )}
                <Text style={[styles.flowNodeText, isWakeCompleted && styles.completedNodeText]}>
                  {completedMeta[`${getYYYYMMDD(selectedDate)} _wake_title`] || '기상'}
                </Text>
              </TouchableOpacity>
              <DropArrow
                highlighted={false}
              />
            </View>
          }
          ListFooterComponent={
            <View style={{ flex: 1, width: '100%', alignItems: 'center' }}>
              <View style={{ alignItems: 'center', paddingBottom: 20 }}>
                <TouchableOpacity
                  style={[
                    styles.flowNode,
                    isSleepCompleted && { backgroundColor: accentColor, borderColor: accentColor },
                    selectedTaskId === 'sleep' && styles.selectedFlowNode,
                    (selectedTaskId === 'sleep' && isSleepCompleted) && { borderColor: '#fff' }
                  ]}
                  onPress={(e) => { e.stopPropagation(); handleTaskPress('sleep'); }}
                >
                  {completedMeta[`${getYYYYMMDD(selectedDate)} _sleep_hasTime`] && (
                    <Text style={{ color: isSleepCompleted ? '#ddd' : '#666', fontSize: 13, marginBottom: 4 }}>
                      {formatFlowTime(new Date(completedMeta[`${getYYYYMMDD(selectedDate)} _sleep_time`]))}
                    </Text>
                  )}
                  <Text style={[styles.flowNodeText, isSleepCompleted && styles.completedNodeText]}>
                    {completedMeta[`${getYYYYMMDD(selectedDate)} _sleep_title`] || '취침'}
                  </Text>
                </TouchableOpacity>
              </View>
              <Pressable
                style={{ flex: 1, width: '100%', minHeight: 150 }}
                onPress={() => { if (selectedTaskId) closeShortcutMenu(); }}
              />
            </View>
          }
          contentContainerStyle={{ width: '100%', alignItems: 'center', flexGrow: 1, paddingTop: 180 + 20 }}
          showsVerticalScrollIndicator={false}
          onScrollBeginDrag={() => { if (selectedTaskId) closeShortcutMenu(); }}
          onScroll={Animated.event(
            [{ nativeEvent: { contentOffset: { y: scrollY } } }],
            { useNativeDriver: false }
          )}
          scrollEventThrottle={16}
          minimumZoomScale={0.5}
          maximumZoomScale={5.0}
          centerContent={true}
        />
      </View>

      {/* Safe Check: !selectedTaskId -> only if null/false. Not empty string. */}
      {
        !selectedTaskId && (
          <View style={styles.bottomControls}>
            <View style={[styles.leftControlGroup, { backgroundColor: 'transparent', overflow: 'hidden', borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.2)' }]}>
              <BlurView intensity={50} tint="dark" style={StyleSheet.absoluteFill} />
              <View style={{ ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(25, 25, 30, 0.5)' }} />
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 25 }}>
                <TouchableOpacity style={styles.iconButton} onPress={() => setIsSettingsVisible(true)}>
                  <Image source={require('./assets/setting_ic.png')} style={{ width: 24, height: 24, opacity: 0.8 }} resizeMode="contain" />
                </TouchableOpacity>
                <TouchableOpacity style={styles.iconButton} onPress={() => setIsAiMode(true)}>
                  <Image source={require('./assets/ai_ic.png')} style={{ width: 24, height: 24, opacity: 0.8 }} resizeMode="contain" />
                </TouchableOpacity>
                <TouchableOpacity style={styles.iconButton} onPress={() => setInboxVisible(true)}>
                  <Image source={require('./assets/inbox_ic.png')} style={{ width: 24, height: 24, opacity: 0.8 }} resizeMode="contain" />
                </TouchableOpacity>
              </View>
            </View>

            <TouchableOpacity style={[styles.fab, { backgroundColor: 'transparent', overflow: 'hidden', borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.2)' }]} onPress={openNewTaskModal}>
              <BlurView intensity={50} tint="dark" style={{ flex: 1, width: '100%', alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(25, 25, 30, 0.5)' }}>
                <View style={{ ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(255, 255, 255, 0.05)' }} />
                <Feather name="plus" size={32} color="#fff" style={{ opacity: 0.8 }} />
              </BlurView>
            </TouchableOpacity>
          </View>
        )
      }

      {/* Safe Check: selectedTaskId must be truthy (string) */}
      {
        selectedTaskId && (
          <Animated.View style={[styles.shortcutMenu, { opacity: slideAnim, transform: [{ translateY: slideAnim.interpolate({ inputRange: [0, 1], outputRange: [100, 0] }) }] }]}>
            {(selectedTaskId === 'wake' || selectedTaskId === 'sleep') ? (
              <>
                <TouchableOpacity style={styles.shortcutButton} onPress={() => handleShortcutAction('edit')}><Feather name="edit-2" size={24} color="#fff" /></TouchableOpacity>
                <View style={styles.shortcutDivider} />
                <TouchableOpacity style={styles.shortcutButton} onPress={() => handleShortcutAction('complete')}><Feather name="check" size={24} color="#fff" /></TouchableOpacity>
              </>
            ) : (
              <>
                <TouchableOpacity style={styles.shortcutButton} onPress={() => handleShortcutAction('delete')}><Feather name="trash-2" size={24} color="#fff" /></TouchableOpacity>
                <View style={styles.shortcutDivider} />
                <TouchableOpacity style={styles.shortcutButton} onPress={() => handleShortcutAction('edit')}><Feather name="edit-2" size={24} color="#fff" /></TouchableOpacity>
                <View style={styles.shortcutDivider} />
                <TouchableOpacity style={styles.shortcutButton} onPress={() => handleShortcutAction('complete')}><Feather name="check" size={24} color="#fff" /></TouchableOpacity>
              </>
            )}
          </Animated.View>
        )
      }

      {
        inboxVisible && (
          <View style={[styles.inboxModalOverlay, styles.absoluteFull]}>
            <TouchableWithoutFeedback onPress={() => { setInboxVisible(false); }}>
              <View style={styles.absoluteFull} />
            </TouchableWithoutFeedback>

            <View style={[styles.inboxModalContent, { backgroundColor: 'transparent', overflow: 'hidden', borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)' }]}>
              <BlurView intensity={40} tint="dark" style={StyleSheet.absoluteFill} />
              <View style={{ ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(255,255,255,0.02)' }} />
              <View style={styles.inboxHeader}>
                <TouchableOpacity
                  style={[
                    styles.closeButton,
                    {
                      backgroundColor: 'transparent',
                      overflow: 'hidden',
                      borderWidth: 1.5,
                      borderColor: 'rgba(255, 255, 255, 0.2)',
                    }
                  ]}
                  onPress={() => setInboxVisible(false)}
                >
                  <BlurView
                    intensity={50}
                    tint="dark"
                    style={{
                      flex: 1,
                      width: '100%',
                      alignItems: 'center',
                      justifyContent: 'center',
                      backgroundColor: 'rgba(25, 25, 30, 0.5)',
                    }}
                  >
                    <View style={{
                      ...StyleSheet.absoluteFillObject,
                      backgroundColor: 'rgba(255, 255, 255, 0.05)',
                    }} />
                    <Feather name="x" size={24} color="#FFFFFF" style={{ opacity: 0.8 }} />
                  </BlurView>
                </TouchableOpacity>
                <Text style={styles.modalTitle}>인박스</Text>
                <TouchableOpacity
                  style={[
                    styles.addButton,
                    {
                      backgroundColor: 'transparent',
                      overflow: 'hidden',
                      borderWidth: 1.5,
                      borderColor: 'rgba(255, 255, 255, 0.2)',
                    }
                  ]}
                  onPress={openTaskModalFromInbox}
                >
                  <BlurView
                    intensity={50}
                    tint="dark"
                    style={{
                      flex: 1,
                      width: '100%',
                      alignItems: 'center',
                      justifyContent: 'center',
                      backgroundColor: 'rgba(25, 25, 30, 0.5)',
                    }}
                  >
                    <View style={{
                      ...StyleSheet.absoluteFillObject,
                      backgroundColor: 'rgba(255, 255, 255, 0.05)',
                    }} />
                    <Feather name="plus" size={24} color="#FFFFFF" style={{ opacity: 0.8 }} />
                  </BlurView>
                </TouchableOpacity>
              </View>

              <View style={styles.inboxBody}>
                {inboxTasks.length === 0 ? (
                  <Text style={styles.inboxPlaceholder}>할 일정을 인박스에 등록해주세요</Text>
                ) : (
                  <ScrollView style={{ width: '100%' }} contentContainerStyle={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10, paddingBottom: 100 }} onScroll={({ nativeEvent }) => { const { layoutMeasurement, contentOffset, contentSize } = nativeEvent; const isCloseToBottom = layoutMeasurement.height + contentOffset.y >= contentSize.height - 20; if (isCloseToBottom) { if (inboxPage * 15 < inboxTasks.length) setInboxPage(prev => prev + 1); } }} scrollEventThrottle={400}>
                    {displayedInboxTasks.map((task) => (<InboxTag key={task.id} task={task} onSelect={handleInboxTaskClick} />))}
                  </ScrollView>
                )}
              </View>
            </View>
          </View>
        )
      }



      <Modal animationType="slide" transparent={true} visible={modalVisible} onRequestClose={resetModal}>

        <View style={styles.modalContainer}>
          <ScrollView ref={modalScrollRef} style={styles.modalScroll} contentContainerStyle={{ flexGrow: 1 }} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
            <View style={styles.modalContent}>
              <View style={styles.modalHeader}>
                <TouchableOpacity
                  style={[
                    styles.closeButton,
                    {
                      backgroundColor: 'transparent',
                      overflow: 'hidden',
                      borderWidth: 1.5,
                      borderColor: 'rgba(255, 255, 255, 0.2)',
                    }
                  ]}
                  onPress={resetModal}
                >
                  <BlurView
                    intensity={50}
                    tint="dark"
                    style={{
                      flex: 1,
                      width: '100%',
                      alignItems: 'center',
                      justifyContent: 'center',
                      backgroundColor: 'rgba(25, 25, 30, 0.5)',
                    }}
                  >
                    <View style={{
                      ...StyleSheet.absoluteFillObject,
                      backgroundColor: 'rgba(255, 255, 255, 0.05)',
                    }} />

                    <Feather name="x" size={24} color="#FFFFFF" style={{ opacity: 0.8 }} />
                  </BlurView>
                </TouchableOpacity>

                <Text style={styles.modalTitle}>{editingTaskId ? '할일 수정' : '할일'}</Text>

                <TouchableOpacity
                  style={[
                    styles.checkButton,
                    {
                      backgroundColor: 'transparent',
                      overflow: 'hidden',
                      borderWidth: 1.5,
                      borderColor: 'rgba(255, 255, 255, 0.2)',
                    }
                  ]}
                  onPress={handleSaveTask}
                >
                  <BlurView
                    intensity={50}
                    tint="dark"
                    style={{
                      flex: 1,
                      width: '100%',
                      alignItems: 'center',
                      justifyContent: 'center',
                      backgroundColor: 'rgba(25, 25, 30, 0.5)',
                    }}
                  >
                    <View style={{
                      ...StyleSheet.absoluteFillObject,
                      backgroundColor: 'rgba(255, 255, 255, 0.05)',
                    }} />

                    <Feather name="check" size={24} color="#FFFFFF" style={{ opacity: 0.8 }} />
                  </BlurView>
                </TouchableOpacity>
              </View>

              {(editingTaskId !== 'wake' && editingTaskId !== 'sleep') && (
                <View style={styles.segmentContainer}>
                  <View style={styles.segmentBackground}>
                    <TouchableOpacity style={selectedTab === 'flow' ? styles.segmentButtonActive : styles.segmentButton} onPressIn={() => setSelectedTab('flow')} activeOpacity={1}><Text style={selectedTab === 'flow' ? styles.segmentTextActive : styles.segmentText}>플로우</Text></TouchableOpacity>
                    <TouchableOpacity style={selectedTab === 'inbox' ? styles.segmentButtonActive : styles.segmentButton} onPressIn={() => setSelectedTab('inbox')} activeOpacity={1}><Text style={selectedTab === 'inbox' ? styles.segmentTextActive : styles.segmentText}>인박스</Text></TouchableOpacity>
                  </View>
                </View>
              )}

              <View style={styles.inputContainer}>
                {isEnabledTime && <Text style={styles.timeDisplay}>{formatTime(date)}</Text>}
                <TextInput
                  style={styles.mainInput} placeholder="새로운 할일 입력" placeholderTextColor="#666" multiline
                  value={taskTitle} onChangeText={setTaskTitle} keyboardType="default"
                />
                {isEnabledDuration && <Text style={styles.durationDisplay}>{selectedDuration} 동안</Text>}
              </View>

              <View style={styles.optionsContainer}>
                <View style={[styles.optionRow, isEnabledTime && styles.optionRowActive]}>
                  <TouchableOpacity
                    style={styles.optionRowContent}
                    activeOpacity={0.7}
                    onPress={() => {
                      if (!isEnabledTime) {
                        setIsEnabledTime(true);
                        setIsTimePickerOpen(true);
                        setIsDurationPickerOpen(false);
                        setTimeout(() => { modalScrollRef.current?.scrollTo({ y: 200, animated: true }); }, 100);
                      } else {
                        if (!isTimePickerOpen) setIsDurationPickerOpen(false);
                        setIsTimePickerOpen(prev => !prev);
                      }
                    }}
                  >
                    <View style={styles.optionLeft} pointerEvents="none"><Feather name="clock" size={20} color="#aaa" /><Text style={styles.optionText}>시간</Text></View>
                    <Switch trackColor={{ false: "#333", true: accentColor }} thumbColor={"#fff"} onValueChange={(val) => {
                      setIsEnabledTime(val);
                      setIsTimePickerOpen(val);
                      if (val) {
                        setIsDurationPickerOpen(false);
                        setTimeout(() => { modalScrollRef.current?.scrollTo({ y: 200, animated: true }); }, 100);
                      }
                    }} value={isEnabledTime} />
                  </TouchableOpacity>
                  {isEnabledTime && isTimePickerOpen && (
                    <View style={styles.datePickerContainer}>
                      <DateTimePicker testID="dateTimePicker" value={date} mode="time" is24Hour={false} display="spinner" onChange={onChange} textColor="white" themeVariant="dark" locale="ko-KR" minuteInterval={5} />
                    </View>
                  )}
                </View>

                {(editingTaskId !== 'wake' && editingTaskId !== 'sleep') && (
                  <View style={[styles.optionRow, isEnabledDuration && styles.optionRowActive]}>
                    <TouchableOpacity
                      style={styles.optionRowContent}
                      activeOpacity={0.7}
                      onPress={() => {
                        if (!isEnabledDuration) {
                          setIsEnabledDuration(true);
                          setIsDurationPickerOpen(true);
                          setIsTimePickerOpen(false);
                        } else {
                          if (!isDurationPickerOpen) setIsTimePickerOpen(false);
                          setIsDurationPickerOpen(prev => !prev);
                        }
                      }}
                    >
                      <View style={styles.optionLeft} pointerEvents="none"><MaterialCommunityIcons name="chart-arc" size={20} color="#aaa" /><Text style={styles.optionText}>소요시간</Text></View>
                      <Switch trackColor={{ false: "#333", true: accentColor }} thumbColor={"#fff"} onValueChange={(val) => {
                        setIsEnabledDuration(val);
                        setIsDurationPickerOpen(val);
                        if (val) setIsTimePickerOpen(false);
                      }} value={isEnabledDuration} />
                    </TouchableOpacity>
                    {isEnabledDuration && isDurationPickerOpen && (
                      <View style={styles.pickerContainer}>
                        <Picker selectedValue={selectedDuration} onValueChange={(itemValue) => setSelectedDuration(itemValue)} itemStyle={{ color: 'white', fontSize: 18, height: 180 }} dropdownIconColor="white" style={{ width: '100%', backgroundColor: 'transparent' }}>
                          {DURATION_OPTIONS.map((option) => <Picker.Item label={option} value={option} key={option} color="white" />)}
                        </Picker>
                      </View>
                    )}
                  </View>
                )}

                <View style={[styles.optionRow, !isEnabledTime && { opacity: 0.5 }]}>
                  <View
                    ref={notificationButtonRef}
                    collapsable={false}
                    style={{ flex: 1 }}
                  >
                    <TouchableOpacity
                      style={styles.optionRowContent}
                      onPress={() => {
                        notificationButtonRef.current?.measureInWindow((x, y, width, height) => {
                          const windowHeight = Dimensions.get('window').height;
                          // Align bottom of dropdown to button, growing upwards
                          setDropdownPos({ bottom: windowHeight - y - 60 });
                          setIsNotificationOpen(true);
                        });
                      }}
                      activeOpacity={0.7}
                      disabled={!isEnabledTime}
                    >
                      <View style={styles.optionLeft} pointerEvents="none">
                        <Feather name="bell" size={20} color="#aaa" />
                        <Text style={styles.optionText}>알림</Text>
                      </View>
                      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                        <Text style={{ color: '#666', marginRight: 10, fontSize: 16 }}>{notification}</Text>
                      </View>
                    </TouchableOpacity>
                  </View>
                </View>

                {(editingTaskId !== 'wake' && editingTaskId !== 'sleep') && (
                  <View style={styles.optionRow}>
                    <View
                      ref={repeatButtonRef}
                      collapsable={false}
                      style={{ flex: 1 }}
                    >
                      <TouchableOpacity
                        style={styles.optionRowContent}
                        onPress={() => {
                          repeatButtonRef.current?.measureInWindow((x, y, width, height) => {
                            const windowHeight = Dimensions.get('window').height;
                            // Align bottom of dropdown to bottom of button area approx
                            setDropdownPos({ bottom: windowHeight - y - 60 });
                            setIsRepeatOpen(true);
                          });
                        }}
                        activeOpacity={0.7}
                      >
                        <View style={styles.optionLeft} pointerEvents="none">
                          <Feather name="repeat" size={20} color="#aaa" />
                          <Text style={styles.optionText}>일정반복</Text>
                        </View>
                        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                          <Text style={{ color: '#666', marginRight: 10, fontSize: 16 }}>{repeat}</Text>
                          {repeat !== '안 함' && <Feather name="chevron-down" size={20} color="#666" />}
                        </View>
                      </TouchableOpacity>
                    </View>
                  </View>
                )}


                {(editingTaskId && editingTaskId !== 'wake' && editingTaskId !== 'sleep') && (
                  <TouchableOpacity
                    style={{ marginTop: 40, alignItems: 'center', padding: 15 }}
                    onPress={() => handleDeleteTask(editingTaskId)}
                  >
                    <Text style={{ color: '#ff4444', fontSize: 16, fontWeight: '600' }}>일정 삭제</Text>
                  </TouchableOpacity>
                )}
              </View>
            </View>
          </ScrollView>

          {/* Repeat Change Confirmation Modal */}
          {isRepeatChangeModalVisible && (
            <View style={styles.absoluteFull}>
              <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', alignItems: 'center' }}>
                <View style={{ width: '85%', backgroundColor: '#1c1c1e', borderRadius: 20, padding: 24 }}>
                  <Text style={{ color: '#fff', fontSize: 18, fontWeight: '600', marginBottom: 20 }}>반복 일정 수정</Text>

                  <TouchableOpacity
                    style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 16 }}
                    onPress={() => setRepeatChangeScope('single')}
                  >
                    <View style={{ width: 20, height: 20, borderRadius: 10, borderWidth: 2, borderColor: repeatChangeScope === 'single' ? accentColor : '#666', marginRight: 12, justifyContent: 'center', alignItems: 'center' }}>
                      {repeatChangeScope === 'single' && <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: accentColor }} />}
                    </View>
                    <Text style={{ color: '#ddd', fontSize: 16 }}>이 일정</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 30 }}
                    onPress={() => setRepeatChangeScope('all')}
                  >
                    <View style={{ width: 20, height: 20, borderRadius: 10, borderWidth: 2, borderColor: repeatChangeScope === 'all' ? accentColor : '#666', marginRight: 12, justifyContent: 'center', alignItems: 'center' }}>
                      {repeatChangeScope === 'all' && <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: accentColor }} />}
                    </View>
                    <Text style={{ color: '#ddd', fontSize: 16 }}>모든 일정</Text>
                  </TouchableOpacity>

                  <View style={{ flexDirection: 'row', justifyContent: 'flex-end', gap: 20 }}>
                    <TouchableOpacity onPress={() => setIsRepeatChangeModalVisible(false)}>
                      <Text style={{ color: '#aaa', fontSize: 16, fontWeight: '600' }}>취소</Text>
                    </TouchableOpacity>
                    <TouchableOpacity onPress={() => { setIsRepeatChangeModalVisible(false); processSave(repeatChangeScope); }}>
                      <Text style={{ color: accentColor, fontSize: 16, fontWeight: '600' }}>변경</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              </View>
            </View>
          )}



          {/* Overlays for Notification and Repeat - Placed here to be inside the Modal context */}
          <DropdownOverlay
            visible={isNotificationOpen}
            onClose={() => setIsNotificationOpen(false)}
            options={NOTIFICATION_OPTIONS}
            selectedValue={notification}
            onSelect={setNotification}
            top={dropdownPos.top}
            bottom={dropdownPos.bottom}
          />

          <DropdownOverlay
            visible={isRepeatOpen}
            onClose={() => setIsRepeatOpen(false)}
            options={REPEAT_OPTIONS}
            selectedValue={repeat}
            onSelect={setRepeat}
            top={dropdownPos.top}
            bottom={dropdownPos.bottom}
          />

        </View>
      </Modal >

      {/* Settings Modal - Full Screen */}
      <Modal animationType="slide" presentationStyle="pageSheet" visible={isSettingsVisible} onRequestClose={() => setIsSettingsVisible(false)}>
        <View style={{ flex: 1, backgroundColor: bgColor === '#f2f2f6' ? '#fff' : '#000' }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingTop: 20, paddingBottom: 10 }}>
            <TouchableOpacity
              style={{
                width: 44, height: 44, borderRadius: 22, backgroundColor: '#1c1c1e',
                alignItems: 'center', justifyContent: 'center',
                borderWidth: 1, borderColor: '#333'
              }}
              onPress={() => setIsSettingsVisible(false)}
            >
              <Feather name="chevron-left" size={24} color="#fff" />
            </TouchableOpacity>
            <Text style={{ fontSize: 18, fontWeight: 'bold', color: '#fff' }}>설정</Text>
            <View style={{ width: 44 }} />
          </View>

          <ScrollView style={{ flex: 1, paddingHorizontal: 20 }} contentContainerStyle={{ paddingBottom: 50 }}>
            {/* Alarm Settings */}
            <View style={{
              backgroundColor: '#1c1c1e', borderRadius: 24, padding: 20, marginBottom: 12,
              flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center'
            }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                <Feather name="clock" size={20} color="#ccc" />
                <Text style={{ color: '#ddd', fontSize: 16 }}>알림 설정</Text>
              </View>
              <Switch
                trackColor={{ false: "#333", true: accentColor }}
                thumbColor={"#fff"}
                onValueChange={handleToggleNotification}
                value={isAppNotificationEnabled}
              />
            </View>



            {/* Point Color Accordion */}
            <View style={{ backgroundColor: '#1c1c1e', borderRadius: 24, overflow: 'hidden', marginBottom: 12 }}>
              <TouchableOpacity
                activeOpacity={0.7}
                onPress={() => setIsPointColorExpanded(!isPointColorExpanded)}
                style={{ padding: 20, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}
              >
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                  <MaterialCommunityIcons name="format-color-fill" size={20} color="#ccc" />
                  <Text style={{ color: '#ddd', fontSize: 16 }}>포인트 색상</Text>
                </View>
                <View style={{ width: 30, height: 30, borderRadius: 15, backgroundColor: accentColor, alignItems: 'center', justifyContent: 'center' }}>
                  <Feather name="check" size={16} color="#fff" />
                </View>
              </TouchableOpacity>

              {isPointColorExpanded && (
                <View style={{ padding: 20, paddingTop: 0 }}>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 12, paddingVertical: 10 }}>
                    {ACCENT_OPTIONS.map(opt => (
                      <TouchableOpacity
                        key={opt.id}
                        style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: opt.color, borderWidth: 2, borderColor: accentId === opt.id ? '#fff' : 'transparent', justifyContent: 'center', alignItems: 'center' }}
                        onPress={() => saveTheme(themeId, opt.id)}
                      >
                        {accentId === opt.id && <Feather name="check" size={18} color="#fff" />}
                      </TouchableOpacity>
                    ))}
                  </ScrollView>
                </View>
              )}
            </View>


            <TouchableOpacity
              style={{
                backgroundColor: '#1c1c1e', borderRadius: 24, padding: 20, marginBottom: 12,
                flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center'
              }}
              onPress={handleResetData}
            >
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                <Feather name="trash-2" size={20} color="#ccc" />
                <Text style={{ color: '#ddd', fontSize: 16 }}>데이터 초기화</Text>
              </View>
              <Text style={{ color: '#ff4444', fontSize: 16 }}>초기화</Text>
            </TouchableOpacity>

            <View style={{
              backgroundColor: '#1c1c1e', borderRadius: 24, padding: 20, marginBottom: 12,
              flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center'
            }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                <Feather name="info" size={20} color="#ccc" />
                <Text style={{ color: '#ddd', fontSize: 16 }}>앱 버전</Text>
              </View>
              <Text style={{ color: '#666', fontSize: 16 }}>v0.2.0</Text>
            </View>

          </ScrollView>

          {/* Reset Confirmation Overlay (Inside Settings Modal) */}
          {isResetConfirmationVisible && (
            <View style={[StyleSheet.absoluteFill, { zIndex: 100 }]}>
              <TouchableWithoutFeedback onPress={() => setIsResetConfirmationVisible(false)}>
                <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'center', alignItems: 'center' }}>
                  <TouchableWithoutFeedback>
                    <View style={{ width: 300, borderRadius: 24, overflow: 'hidden', backgroundColor: 'transparent', borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)' }}>
                      <BlurView intensity={40} tint="dark" style={{ padding: 24, alignItems: 'flex-start', backgroundColor: 'rgba(30,30,35,0.8)' }}>
                        <Text style={{ color: '#fff', fontSize: 18, fontWeight: 'bold', marginBottom: 12 }}>초기화하시겠습니까?</Text>
                        <Text style={{ color: '#aaa', fontSize: 15, textAlign: 'left', marginBottom: 24, lineHeight: 22 }}>
                          초기화 하시면 모든 데이터가 삭제됩니다.
                        </Text>
                        <View style={{ flexDirection: 'row', gap: 12, width: '100%' }}>
                          <TouchableOpacity
                            style={{ flex: 1, height: 48, borderRadius: 16, backgroundColor: '#111', alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: '#333' }}
                            onPress={() => setIsResetConfirmationVisible(false)}
                          >
                            <Text style={{ color: '#fff', fontSize: 16, fontWeight: '600' }}>취소</Text>
                          </TouchableOpacity>
                          <TouchableOpacity
                            style={{ flex: 1, height: 48, borderRadius: 16, backgroundColor: '#ff4444', alignItems: 'center', justifyContent: 'center' }}
                            onPress={confirmResetData}
                          >
                            <Text style={{ color: '#fff', fontSize: 16, fontWeight: '600' }}>초기화</Text>
                          </TouchableOpacity>
                        </View>
                      </BlurView>
                    </View>
                  </TouchableWithoutFeedback>
                </View>
              </TouchableWithoutFeedback>
            </View>
          )}

        </View>
      </Modal >






      {/* Toast Message */}
      {toastMessage && (
        <View style={{ position: 'absolute', bottom: 100, alignSelf: 'center', backgroundColor: '#333', paddingHorizontal: 20, paddingVertical: 10, borderRadius: 20, zIndex: 100 }}>
          <Text style={{ color: '#fff', fontSize: 14 }}>{toastMessage}</Text>
        </View>
      )}



    </SafeAreaView >
  );
}

export default function App() {
  return (
    <SafeAreaProvider>
      <MainApp />
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  absoluteFull: { ...StyleSheet.absoluteFillObject },
  container: { flex: 1, backgroundColor: '#0a0a0a' },
  scrollContent: { flexGrow: 1, paddingTop: 0, justifyContent: 'center' },
  calendarContainer: { height: 105, paddingTop: 15, justifyContent: 'center', backgroundColor: '#0a0a0a', zIndex: 10, borderBottomWidth: 1, borderBottomColor: '#1c1c1e' },
  dateItem: { alignItems: 'center', justifyContent: 'center', width: ITEM_WIDTH, height: 70, borderRadius: 22 },
  activeDateItem: {
    // Handled in component for Glass effect
  },
  dayText: { fontSize: 13, marginBottom: 4, fontWeight: '600', color: '#888' },
  dateText: { fontSize: 19, fontWeight: 'bold', color: '#bbb' },
  flowContainer: { alignItems: 'center', justifyContent: 'center', width: '100%', paddingBottom: 150 },
  flowNode: { width: 100, height: 100, borderRadius: 40, backgroundColor: '#1c1c1e', alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: 'transparent' },
  completedFlowNode: { backgroundColor: '#7B52FF', borderColor: '#7B52FF' },
  selectedFlowNode: { borderColor: '#666' },
  selectedCompletedFlowNode: { borderColor: '#4a30a0', borderWidth: 3 }, // Darker purple border for selected & completed
  flowNodeText: { color: '#aaa', fontSize: 18, fontWeight: '500' },
  completedNodeText: { color: '#fff', fontWeight: 'bold' },
  arrowContainer: { height: 60, width: '100%', justifyContent: 'center', alignItems: 'center' },
  highlightedArrow: { transform: [{ scale: 1.2 }], backgroundColor: 'rgba(123, 82, 255, 0.1)', borderRadius: 30 },
  bottomControls: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 30, paddingBottom: 40, position: 'absolute', bottom: 0, width: '100%', zIndex: 1 },
  leftControlGroup: { flexDirection: 'row', backgroundColor: '#1c1c1e', paddingVertical: 12, paddingHorizontal: 20, borderRadius: 30, gap: 25 },
  iconButton: { alignItems: 'center', justifyContent: 'center' },
  fab: { width: 60, height: 60, borderRadius: 30, backgroundColor: '#1c1c1e', alignItems: 'center', justifyContent: 'center' },
  shortcutMenu: { position: 'absolute', bottom: 40, alignSelf: 'center', flexDirection: 'row', backgroundColor: '#1c1c1e', borderRadius: 30, paddingVertical: 10, paddingHorizontal: 20, alignItems: 'center', justifyContent: 'center', zIndex: 20, borderWidth: 1, borderColor: '#333' },
  shortcutButton: { padding: 10, marginHorizontal: 5 },
  shortcutDivider: { width: 1, height: 20, backgroundColor: '#444', marginHorizontal: 5 },
  modalContainer: { flex: 1, backgroundColor: '#000', justifyContent: 'flex-start', paddingTop: 60 },
  modalScroll: { flex: 1 },
  modalContent: { flex: 1, backgroundColor: '#0a0a0a', paddingHorizontal: 20, paddingBottom: 50 },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 30 },
  closeButton: { width: 44, height: 44, borderRadius: 22, backgroundColor: '#1c1c1e', alignItems: 'center', justifyContent: 'center' },
  checkButton: { width: 44, height: 44, borderRadius: 22, backgroundColor: '#1c1c1e', alignItems: 'center', justifyContent: 'center' },
  modalTitle: { color: '#fff', fontSize: 18, fontWeight: '600' },
  segmentContainer: { alignItems: 'center', marginBottom: 30 },
  segmentBackground: { flexDirection: 'row', backgroundColor: '#0a0a0a', borderRadius: 20, borderWidth: 1, borderColor: '#333', padding: 4, width: 160, height: 44, justifyContent: 'space-between', alignItems: 'center' },
  segmentButton: { flex: 1, alignItems: 'center', justifyContent: 'center', height: '100%', borderRadius: 16 },
  segmentButtonActive: { flex: 1, alignItems: 'center', justifyContent: 'center', height: '100%', backgroundColor: '#333', borderRadius: 16 },
  segmentText: { color: '#666', fontWeight: '600' },
  segmentTextActive: { color: '#ddd', fontWeight: '600' },
  inputContainer: { backgroundColor: '#111', borderRadius: 24, padding: 20, height: 220, marginBottom: 20, justifyContent: 'center', alignItems: 'center' },
  timeDisplay: { color: '#888', fontSize: 16, marginBottom: 8, fontWeight: '500' },
  durationDisplay: { color: '#666', fontSize: 16, marginTop: 8, fontWeight: '500' },
  mainInput: { color: '#fff', fontSize: 22, fontWeight: '600', textAlign: 'center', width: '100%', flex: 1, marginBottom: 0 },
  optionsContainer: { gap: 12 },
  optionRow: { backgroundColor: '#111', borderRadius: 20, paddingHorizontal: 20, paddingVertical: 18, flexDirection: 'column' },
  optionRowActive: {},
  optionRowContent: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', width: '100%' },
  datePickerContainer: { marginTop: 10, width: '100%', alignItems: 'center', paddingHorizontal: 20 },
  pickerContainer: { width: '100%', alignItems: 'center', height: 180, overflow: 'hidden', paddingHorizontal: 20 },
  optionLeft: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  optionText: { color: '#ccc', fontSize: 16, fontWeight: '500' },
  inboxModalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end', zIndex: 8000 },
  inboxModalContent: { backgroundColor: '#1c1c1e', borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingHorizontal: 20, paddingTop: 20, paddingBottom: 40, minHeight: 300, maxHeight: '80%' },
  inboxHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 40 },
  addButton: { width: 44, height: 44, borderRadius: 22, backgroundColor: '#1c1c1e', alignItems: 'center', justifyContent: 'center' },
  inboxBody: { flex: 1, justifyContent: 'center', alignItems: 'center', marginBottom: 20 },
  inboxPlaceholder: { color: '#666', fontSize: 16 },
  inboxTag: { backgroundColor: '#2c2c2e', borderRadius: 20, paddingVertical: 10, paddingHorizontal: 16, marginBottom: 10, borderWidth: 1, borderColor: '#333' },
  inboxTagSelected: { borderColor: '#7B52FF', backgroundColor: '#332a4a' },
  draggingTag: { shadowColor: "#000", shadowOffset: { width: 0, height: 10 }, shadowOpacity: 0.5, shadowRadius: 10, elevation: 10, backgroundColor: '#333' },
  inboxShortcutMenu: { flexDirection: 'row', backgroundColor: '#2c2c2e', borderRadius: 20, padding: 10, alignSelf: 'center', position: 'absolute', bottom: 20, gap: 15 },
  inboxShortcutButton: { padding: 10 },
  dropZone: { width: '90%', height: 100, borderWidth: 2, borderColor: '#7B52FF', borderStyle: 'dashed', borderRadius: 20, justifyContent: 'center', alignItems: 'center', marginTop: 10, marginBottom: 10 },
  settingsModalContent: { position: 'absolute', bottom: 0, width: '100%', backgroundColor: '#1c1c1e', borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24, paddingBottom: 50 },
  settingsHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 30 },
  settingsTitle: { color: '#fff', fontSize: 20, fontWeight: 'bold' },
  settingItem: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 16 },
  settingText: { color: '#ddd', fontSize: 16 },
  separator: { height: 1, backgroundColor: '#333', marginVertical: 10 }
});
