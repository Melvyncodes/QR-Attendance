import Sidebar from "@/components/Sidebar";
import { useUser } from "@/context/UserContext";
import { useResponsive } from "@/hooks/useResponsive";
import { Ionicons } from "@expo/vector-icons";
import {
  addDoc,
  arrayRemove,
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  query,
  serverTimestamp,
  updateDoc,
  where,
  writeBatch,
} from "firebase/firestore";
import { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Animated,
  Platform,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import {
  GestureHandlerRootView,
  Swipeable,
} from "react-native-gesture-handler";
import { db } from "../../../firebase";

const getNotifIcon = (type: string) => {
  switch (type) {
    case "session_ended":
      return { name: "checkmark-circle", color: "#2C3E7A" };
    case "delete_course_approved":
      return { name: "checkmark-circle", color: "#27ae60" };
    case "delete_course_rejected":
      return { name: "close-circle", color: "#E74C3C" };
    case "delete_report_approved":
      return { name: "checkmark-circle", color: "#27ae60" };
    case "delete_report_rejected":
      return { name: "close-circle", color: "#E74C3C" };
    case "reset_reports_approved":
      return { name: "checkmark-circle", color: "#27ae60" };
    case "reset_reports_rejected":
      return { name: "close-circle", color: "#E74C3C" };
    case "unenroll_request":
      return { name: "person-remove-outline", color: "#F39C12" };
    case "session_started":
      return { name: "radio-outline", color: "#27ae60" };
    default:
      return { name: "notifications-outline", color: "#F39C12" };
  }
};

export default function LecturerNotifications() {
  const { isWeb } = useResponsive();
  const { userData } = useUser();
  const [notifications, setNotifications] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [processing, setProcessing] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [clearing, setClearing] = useState(false);
  const swipeableRefs = useRef<Map<string, Swipeable>>(new Map());

  useEffect(() => {
    if (!userData?.uid) return;
    const q = query(
      collection(db, "notifications"),
      where("userId", "==", userData.uid),
    );
    return onSnapshot(q, (snap) => {
      const list = snap.docs
        .map((d) => ({ id: d.id, ...d.data() }))
        .sort((a: any, b: any) => {
          const aTime = a.createdAt?.toDate?.() || new Date(0);
          const bTime = b.createdAt?.toDate?.() || new Date(0);
          return bTime.getTime() - aTime.getTime();
        });
      setNotifications(list);
      setLoading(false);
      setRefreshing(false);
    });
  }, [userData]);

  const handleTap = async (notif: any) => {
    setExpandedId((prev) => (prev === notif.id ? null : notif.id));
    if (!notif.read) {
      await updateDoc(doc(db, "notifications", notif.id), { read: true }).catch(
        console.error,
      );
    }
  };

  const markAllRead = async () => {
    const unread = notifications.filter((n) => !n.read);
    await Promise.all(
      unread.map((n) =>
        updateDoc(doc(db, "notifications", n.id), { read: true }),
      ),
    );
  };

  const deleteNotification = async (notifId: string) => {
    try {
      swipeableRefs.current.get(notifId)?.close();
      swipeableRefs.current.delete(notifId);
      await deleteDoc(doc(db, "notifications", notifId));
    } catch (err) {
      console.error(err);
    }
  };

  const clearResolved = async () => {
    // Keep pending unenroll requests, clear everything else
    const toDelete = notifications.filter(
      (n) => !(n.type === "unenroll_request" && n.status === "pending"),
    );
    if (toDelete.length === 0) {
      if (Platform.OS === "web") window.alert("No notifications to clear.");
      else
        Alert.alert("Nothing to Clear", "No resolved notifications to clear.");
      return;
    }
    const doDelete = async () => {
      setClearing(true);
      try {
        const batch = writeBatch(db);
        toDelete.forEach((n) => batch.delete(doc(db, "notifications", n.id)));
        await batch.commit();
      } catch (err) {
        console.error(err);
      } finally {
        setClearing(false);
      }
    };
    if (Platform.OS === "web") {
      if (
        window.confirm(
          `Clear ${toDelete.length} notification${toDelete.length !== 1 ? "s" : ""}? Pending requests will be kept.`,
        )
      )
        doDelete();
    } else {
      Alert.alert(
        "Clear Notifications",
        `Clear ${toDelete.length} notification${toDelete.length !== 1 ? "s" : ""}?\n\nPending unenroll requests will be kept.`,
        [
          { text: "Cancel", style: "cancel" },
          { text: "Clear", style: "destructive", onPress: doDelete },
        ],
      );
    }
  };

  const handleUnenroll = async (notif: any, approve: boolean) => {
    setProcessing(notif.id);
    try {
      if (approve) {
        await updateDoc(doc(db, "courses", notif.courseId), {
          enrolledStudents: arrayRemove(notif.studentId),
        });
        await updateDoc(doc(db, "notifications", notif.id), {
          status: "approved",
          read: true,
          resolvedAt: serverTimestamp(),
        });
        await addDoc(collection(db, "notifications"), {
          userId: notif.studentId,
          type: "unenroll_approved",
          message: `Your request to unenroll from ${notif.courseTitle} has been approved by your lecturer.`,
          courseId: notif.courseId,
          courseTitle: notif.courseTitle,
          read: false,
          createdAt: serverTimestamp(),
        });
      } else {
        await updateDoc(doc(db, "notifications", notif.id), {
          status: "rejected",
          read: true,
          resolvedAt: serverTimestamp(),
        });
        await addDoc(collection(db, "notifications"), {
          userId: notif.studentId,
          type: "unenroll_rejected",
          message: `Your request to unenroll from ${notif.courseTitle} has been rejected by your lecturer.`,
          courseId: notif.courseId,
          courseTitle: notif.courseTitle,
          read: false,
          createdAt: serverTimestamp(),
        });
      }
      setExpandedId(null);
    } catch (err) {
      console.error(err);
    } finally {
      setProcessing(null);
    }
  };

  const formatDate = (timestamp: any) => {
    if (!timestamp) return "";
    const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
    const diff = Date.now() - date.getTime();
    const mins = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);
    if (mins < 1) return "Just now";
    if (mins < 60) return `${mins}m ago`;
    if (hours < 24) return `${hours}h ago`;
    if (days < 7) return `${days}d ago`;
    return date.toLocaleDateString("en-GB", {
      day: "numeric",
      month: "short",
      year: "numeric",
    });
  };

  const renderRightActions = (
    progress: Animated.AnimatedInterpolation<number>,
    dragX: Animated.AnimatedInterpolation<number>,
    notifId: string,
  ) => {
    const scale = dragX.interpolate({
      inputRange: [-100, 0],
      outputRange: [1, 0],
      extrapolate: "clamp",
    });
    return (
      <TouchableOpacity
        style={s.swipeDeleteAction}
        onPress={() => deleteNotification(notifId)}
        activeOpacity={0.8}
      >
        <Animated.View
          style={{ transform: [{ scale }], alignItems: "center", gap: 4 }}
        >
          <Ionicons name="trash-outline" size={24} color="#fff" />
          <Text style={s.swipeDeleteText}>Delete</Text>
        </Animated.View>
      </TouchableOpacity>
    );
  };

  const unreadCount = notifications.filter((n) => !n.read).length;
  const resolvedCount = notifications.filter(
    (n) => !(n.type === "unenroll_request" && n.status === "pending"),
  ).length;

  if (loading) {
    return (
      <View style={s.loadingContainer}>
        <ActivityIndicator size="large" color="#2C3E7A" />
      </View>
    );
  }

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <View style={s.container}>
        {(isWeb || sidebarOpen) && (
          <Sidebar
            role="lecturer"
            userName={
              userData
                ? `${userData.title || ""} ${userData.firstName} ${userData.lastName}`.trim()
                : "..."
            }
            activeRoute="/screens/lecturer/Notifications"
          />
        )}

        <View style={s.content}>
          <View
            style={[
              s.topBar,
              { paddingTop: isWeb ? 22 : 50, minHeight: isWeb ? 64 : 80 },
            ]}
          >
            {!isWeb && !sidebarOpen && (
              <TouchableOpacity
                style={s.menuButton}
                onPress={() => setSidebarOpen(true)}
              >
                <Ionicons name="menu" size={24} color="#2C3E7A" />
              </TouchableOpacity>
            )}
            <Text style={[s.headerTitle, { fontSize: isWeb ? 18 : 15 }]}>
              Notifications
            </Text>
            {unreadCount > 0 && (
              <View style={s.unreadBadge}>
                <Text style={s.unreadBadgeText}>{unreadCount}</Text>
              </View>
            )}
            {unreadCount > 0 && (
              <TouchableOpacity style={s.topBtn} onPress={markAllRead}>
                <Text style={s.topBtnText}>Mark all read</Text>
              </TouchableOpacity>
            )}
            {resolvedCount > 0 && (
              <TouchableOpacity
                style={s.clearAllButton}
                onPress={clearResolved}
                disabled={clearing}
              >
                {clearing ? (
                  <ActivityIndicator size="small" color="#E74C3C" />
                ) : (
                  <Ionicons name="trash-outline" size={16} color="#E74C3C" />
                )}
              </TouchableOpacity>
            )}
          </View>

          <ScrollView
            showsVerticalScrollIndicator={false}
            refreshControl={
              <RefreshControl
                refreshing={refreshing}
                onRefresh={() => setRefreshing(true)}
                colors={["#2C3E7A"]}
                tintColor="#2C3E7A"
              />
            }
          >
            {notifications.length === 0 ? (
              <View style={s.emptyState}>
                <Ionicons
                  name="notifications-outline"
                  size={48}
                  color="#D0D0D0"
                />
                <Text style={s.emptyTitle}>No Notifications</Text>
                <Text style={s.emptySubtitle}>
                  Session reports, unenroll requests and course updates will
                  appear here
                </Text>
              </View>
            ) : (
              <View style={s.notifList}>
                {notifications.map((notif) => {
                  const icon = getNotifIcon(notif.type);
                  const isExpanded = expandedId === notif.id;
                  const isPendingUnenroll =
                    notif.type === "unenroll_request" &&
                    notif.status === "pending";

                  return (
                    <Swipeable
                      key={notif.id}
                      ref={(ref) => {
                        if (ref) swipeableRefs.current.set(notif.id, ref);
                      }}
                      renderRightActions={(progress, dragX) =>
                        renderRightActions(progress, dragX, notif.id)
                      }
                      rightThreshold={40}
                      friction={2}
                      overshootRight={false}
                    >
                      <TouchableOpacity
                        style={[
                          s.notifCard,
                          !notif.read && s.notifCardUnread,
                          isPendingUnenroll && s.notifCardRequest,
                          isExpanded && s.notifCardExpanded,
                        ]}
                        onPress={() => handleTap(notif)}
                        activeOpacity={0.85}
                      >
                        <View style={s.notifRow}>
                          <View
                            style={[
                              s.iconContainer,
                              { backgroundColor: icon.color + "20" },
                            ]}
                          >
                            <Ionicons
                              name={icon.name as any}
                              size={22}
                              color={icon.color}
                            />
                          </View>
                          <View style={s.notifBody}>
                            <Text style={s.notifMessage}>{notif.message}</Text>
                            <Text style={s.notifTime}>
                              {formatDate(notif.createdAt)}
                            </Text>
                          </View>
                          <View style={s.notifRight}>
                            {!notif.read && <View style={s.unreadDot} />}
                            {isPendingUnenroll && (
                              <Ionicons
                                name={
                                  isExpanded ? "chevron-up" : "chevron-down"
                                }
                                size={16}
                                color="#F39C12"
                              />
                            )}
                          </View>
                        </View>

                        {isExpanded && isPendingUnenroll && (
                          <View style={s.expandedSection}>
                            <View style={s.expandedDivider} />
                            <View style={s.detailRow}>
                              <Ionicons
                                name="person-outline"
                                size={14}
                                color="#666"
                              />
                              <Text style={s.detailText}>
                                {notif.studentName} — {notif.matricNumber}
                              </Text>
                            </View>
                            <View style={s.detailRow}>
                              <Ionicons
                                name="book-outline"
                                size={14}
                                color="#666"
                              />
                              <Text style={s.detailText}>
                                {notif.courseTitle}
                              </Text>
                            </View>
                            {processing === notif.id ? (
                              <ActivityIndicator
                                size="small"
                                color="#2C3E7A"
                                style={{ marginTop: 8 }}
                              />
                            ) : (
                              <View style={s.actionButtons}>
                                <TouchableOpacity
                                  style={s.rejectBtn}
                                  onPress={() => handleUnenroll(notif, false)}
                                >
                                  <Ionicons
                                    name="close-circle-outline"
                                    size={16}
                                    color="#E74C3C"
                                  />
                                  <Text style={s.rejectBtnText}>Reject</Text>
                                </TouchableOpacity>
                                <TouchableOpacity
                                  style={s.approveBtn}
                                  onPress={() => handleUnenroll(notif, true)}
                                >
                                  <Ionicons
                                    name="checkmark-circle-outline"
                                    size={16}
                                    color="#fff"
                                  />
                                  <Text style={s.approveBtnText}>
                                    Approve & Unenroll
                                  </Text>
                                </TouchableOpacity>
                              </View>
                            )}
                          </View>
                        )}

                        {isExpanded &&
                          notif.type === "unenroll_request" &&
                          notif.status !== "pending" && (
                            <View style={s.expandedSection}>
                              <View style={s.expandedDivider} />
                              <View
                                style={[
                                  s.resolvedBadge,
                                  {
                                    backgroundColor:
                                      notif.status === "approved"
                                        ? "#EEF2FF"
                                        : "#FDEDEC",
                                  },
                                ]}
                              >
                                <Text
                                  style={[
                                    s.resolvedText,
                                    {
                                      color:
                                        notif.status === "approved"
                                          ? "#2C3E7A"
                                          : "#E74C3C",
                                    },
                                  ]}
                                >
                                  {notif.status === "approved"
                                    ? "✓ Request Approved"
                                    : "✗ Request Rejected"}
                                </Text>
                              </View>
                            </View>
                          )}
                      </TouchableOpacity>
                    </Swipeable>
                  );
                })}
              </View>
            )}
          </ScrollView>
        </View>

        {sidebarOpen && !isWeb && (
          <TouchableOpacity
            style={s.overlay}
            onPress={() => setSidebarOpen(false)}
          />
        )}
      </View>
    </GestureHandlerRootView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, flexDirection: "row", backgroundColor: "#F5F6FA" },
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#F5F6FA",
  },
  content: { flex: 1, overflow: "hidden", minWidth: 0 },
  topBar: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#fff",
    paddingHorizontal: 24,
    paddingVertical: 22,
    borderBottomWidth: 1,
    borderBottomColor: "#E0E0E0",
    gap: 8,
    flexWrap: "wrap",
  },
  menuButton: {
    width: 40,
    height: 40,
    borderRadius: 8,
    backgroundColor: "#F5F6FA",
    justifyContent: "center",
    alignItems: "center",
  },
  headerTitle: { fontWeight: "bold", color: "#2C3E7A", flex: 1 },
  unreadBadge: {
    backgroundColor: "#E74C3C",
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 10,
  },
  unreadBadgeText: { color: "#fff", fontSize: 12, fontWeight: "700" },
  topBtn: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: "#2C3E7A",
  },
  topBtnText: { color: "#2C3E7A", fontSize: 12, fontWeight: "600" },
  clearBtn: { borderColor: "#E74C3C" },
  clearBtnText: { color: "#E74C3C", fontSize: 12, fontWeight: "600" },
  clearAllButton: {
    width: 36,
    height: 32,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: "#E74C3C",
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#FDEDEC",
  },
  swipeDeleteAction: {
    backgroundColor: "#E74C3C",
    justifyContent: "center",
    alignItems: "center",
    width: 100,
    marginBottom: 8,
    borderRadius: 12,
  },
  swipeDeleteText: { color: "#fff", fontSize: 12, fontWeight: "700" },
  notifList: { padding: 16, gap: 8 },
  notifCard: {
    backgroundColor: "#fff",
    borderRadius: 12,
    padding: 16,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 2,
  },
  notifCardUnread: {
    borderLeftWidth: 3,
    borderLeftColor: "#2C3E7A",
    backgroundColor: "#F8F9FF",
  },
  notifCardRequest: { borderLeftWidth: 3, borderLeftColor: "#F39C12" },
  notifCardExpanded: { borderLeftWidth: 3, borderLeftColor: "#2C3E7A" },
  notifRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  iconContainer: {
    width: 44,
    height: 44,
    borderRadius: 22,
    justifyContent: "center",
    alignItems: "center",
  },
  notifBody: { flex: 1, gap: 4 },
  notifMessage: { fontSize: 14, color: "#2D3436", lineHeight: 20 },
  notifTime: { fontSize: 12, color: "#999" },
  notifRight: { flexDirection: "column", alignItems: "center", gap: 4 },
  unreadDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: "#2C3E7A",
  },
  expandedSection: { marginTop: 12, gap: 8 },
  expandedDivider: { height: 1, backgroundColor: "#F0F0F0", marginBottom: 4 },
  detailRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  detailText: { fontSize: 13, color: "#555" },
  actionButtons: { flexDirection: "row", gap: 10, marginTop: 4 },
  rejectBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#E74C3C",
    gap: 6,
  },
  rejectBtnText: { color: "#E74C3C", fontWeight: "600", fontSize: 13 },
  approveBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 10,
    borderRadius: 8,
    backgroundColor: "#2C3E7A",
    gap: 6,
  },
  approveBtnText: { color: "#fff", fontWeight: "600", fontSize: 13 },
  resolvedBadge: { padding: 10, borderRadius: 8, alignItems: "center" },
  resolvedText: { fontSize: 13, fontWeight: "600" },
  emptyState: {
    alignItems: "center",
    paddingVertical: 80,
    gap: 12,
    paddingHorizontal: 40,
  },
  emptyTitle: { fontSize: 18, fontWeight: "bold", color: "#2C3E7A" },
  emptySubtitle: { fontSize: 14, color: "#666", textAlign: "center" },
  overlay: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: "rgba(0,0,0,0.5)",
    zIndex: 10,
  },
});
