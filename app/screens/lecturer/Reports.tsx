import OfflineBanner from '@/components/OfflineBanner';
import Sidebar from '@/components/Sidebar';
import { useUser } from '@/context/UserContext';
import { Ionicons } from '@expo/vector-icons';
import { addDoc, collection, getDocs, query, serverTimestamp, where } from 'firebase/firestore';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Platform,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View
} from 'react-native';
import * as XLSX from 'xlsx';
import { db } from '../../../firebase';
import { useResponsive } from '../../../hooks/useResponsive';

export default function LecturerReports() {
  const { isWeb } = useResponsive();
  const { userData } = useUser();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [reports, setReports] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedReport, setSelectedReport] = useState<any>(null);
  const [downloading, setDownloading] = useState<string | null>(null);
  const [requesting, setRequesting] = useState<string | null>(null);
  const [pendingRequests, setPendingRequests] = useState<Record<string, boolean>>({});
  const [view, setView] = useState<'all' | 'course' | 'level'>('all');
  const [coursesData, setCoursesData] = useState<Record<string, any>>({});
  const [selectedLevelFirst, setSelectedLevelFirst] = useState<string | null>(null);
  const [selectedCourseSecond, setSelectedCourseSecond] = useState<string | null>(null);

  const fetchReports = async () => {
    if (!userData?.uid) return;
    try {
      const q = query(collection(db, 'reports'), where('lecturerId', '==', userData.uid));
      const snap = await getDocs(q);
      const list = snap.docs.map(d => ({ id: d.id, ...d.data() }))
        .sort((a: any, b: any) => new Date(b.date || 0).getTime() - new Date(a.date || 0).getTime());
      setReports(list);

      const notifSnap = await getDocs(query(
        collection(db, 'notifications'),
        where('userId', '==', 'admin'),
        where('requestedById', '==', userData.uid),
        where('status', '==', 'pending')
      ));
      const pendingMap: Record<string, boolean> = {};
      notifSnap.docs.forEach(d => {
        const data = d.data();
        if (data.type === 'delete_report_request' && data.reportId) {
          pendingMap[data.reportId] = true;
        }
        if (data.type === 'reset_course_reports_request' && data.courseId) {
          pendingMap[`course_${data.courseId}`] = true;
        }
      });
      setPendingRequests(pendingMap);

      // Fetch lecturer's courses to get level info
      const coursesSnap = await getDocs(query(collection(db, 'courses'), where('lecturerId', '==', userData.uid)));
      const courseMap: Record<string, any> = {};
      coursesSnap.docs.forEach(d => {
        courseMap[d.id] = { id: d.id, ...d.data() };
      });
      setCoursesData(courseMap);
    } catch (err) { console.error(err); }
    finally { setLoading(false); setRefreshing(false); }
  };

  useEffect(() => { if (userData?.uid) fetchReports(); }, [userData?.uid]);
  const onRefresh = () => { setRefreshing(true); fetchReports(); };

  // ── Build cumulative Excel for ALL sessions of a course ──
  const buildCumulativeExcel = (courseReports: any[], courseCode: string, courseTitle: string): string => {
    const wb = XLSX.utils.book_new();
    const sortedReports = [...courseReports].sort((a, b) => new Date(a.date || 0).getTime() - new Date(b.date || 0).getTime());

    // Collect all unique students across all sessions
    const studentMap = new Map<string, any>();
    sortedReports.forEach(report => {
      [...(report.presentStudents || []), ...(report.absentStudents || [])].forEach((s: any) => {
        if (s.uid && !studentMap.has(s.uid)) studentMap.set(s.uid, s);
      });
    });
    const allStudents = Array.from(studentMap.values()).sort((a, b) =>
      (a.name || '').localeCompare(b.name || '')
    );

    const lecturerFullName = sortedReports[0]?.lecturerName || `${userData?.title || ''} ${userData?.firstName} ${userData?.lastName}`.trim();
    const programme = userData?.department || '';
    const month = new Date().getMonth();
    const semester = (month >= 8 || month === 0) ? 'FIRST' : 'SECOND';
    const year = new Date().getFullYear();
    const academicSession = month >= 8 ? `${year}/${year + 1}` : `${year - 1}/${year}`;

    const MAX_SESSION_COLUMNS = 12;
    const sessionDates = sortedReports.slice(0, MAX_SESSION_COLUMNS).map(r =>
      new Date(r.date).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })
    );
    while (sessionDates.length < MAX_SESSION_COLUMNS) sessionDates.push('');

    const sessionPresentSets = sortedReports.slice(0, MAX_SESSION_COLUMNS).map(r =>
      new Set((r.presentStudents || []).map((s: any) => s.uid))
    );

    const totalCols = 3 + MAX_SESSION_COLUMNS;
    const empty = (n: number) => Array(n).fill('');
    const rows: any[][] = [];

    rows.push([`ATTENDANCE SHEET FOR ${semester} SEMESTER ${academicSession} ACADEMIC SESSION`, ...empty(totalCols - 1)]);
    rows.push([`COURSE CODE: ${courseCode}`, ...empty(2), `PROGRAMME: ${programme}`, ...empty(totalCols - 4)]);
    rows.push([`COURSE TITLE: ${courseTitle}`, ...empty(2), `LEVEL: ${(userData?.level || '').toString()}`, ...empty(totalCols - 4)]);
    rows.push([`LECTURER: ${lecturerFullName}`, ...empty(totalCols - 1)]);
    rows.push(['STUDENTS DETAILS', ...empty(2), 'LECTURE DATES AND ATTENDANCE', ...empty(totalCols - 4)]);
    rows.push(['S/N', 'NAME', 'MATRIC NO.', ...sessionDates]);

    const minRows = 150;
    const totalRows = Math.max(allStudents.length, minRows);
    for (let i = 0; i < totalRows; i++) {
      if (i < allStudents.length) {
        const student = allStudents[i];
        const cells = sessionPresentSets.map((presentSet, idx) => {
          if (idx >= sortedReports.length) return '';
          return presentSet.has(student.uid) ? '✓' : '-';
        });
        while (cells.length < MAX_SESSION_COLUMNS) cells.push('');
        rows.push([
          i + 1,
          (student.name || '').toUpperCase(),
          (student.matricNumber || '').toUpperCase(),
          ...cells,
        ]);
      } else {
        rows.push([i + 1, ...empty(totalCols - 1)]);
      }
    }

    const totalSessions = sortedReports.length;
    const totalPresentSum = sessionPresentSets.reduce((sum, set) => sum + set.size, 0);
    const totalPossible = allStudents.length * totalSessions;
    const overallRate = totalPossible > 0 ? Math.round((totalPresentSum / totalPossible) * 100) : 0;
    rows.push([
      `TOTAL SESSIONS: ${totalSessions}  |  OVERALL ATTENDANCE: ${overallRate}%  |  ✓ = Present  |  - = Absent`,
      ...empty(totalCols - 1)
    ]);

    const ws = XLSX.utils.aoa_to_sheet(rows);
    ws['!cols'] = [
      { wch: 6 }, { wch: 32 }, { wch: 18 },
      ...Array(MAX_SESSION_COLUMNS).fill({ wch: 11 }),
    ];

    ws['!merges'] = [
      { s: { r: 0, c: 0 }, e: { r: 0, c: totalCols - 1 } },
      { s: { r: 1, c: 0 }, e: { r: 1, c: 2 } },
      { s: { r: 1, c: 3 }, e: { r: 1, c: totalCols - 1 } },
      { s: { r: 2, c: 0 }, e: { r: 2, c: 2 } },
      { s: { r: 2, c: 3 }, e: { r: 2, c: totalCols - 1 } },
      { s: { r: 3, c: 0 }, e: { r: 3, c: totalCols - 1 } },
      { s: { r: 4, c: 0 }, e: { r: 4, c: 2 } },
      { s: { r: 4, c: 3 }, e: { r: 4, c: totalCols - 1 } },
      { s: { r: rows.length - 1, c: 0 }, e: { r: rows.length - 1, c: totalCols - 1 } },
    ];

    XLSX.utils.book_append_sheet(wb, ws, 'Attendance Sheet');
    return XLSX.write(wb, { type: 'base64', bookType: 'xlsx' });
  };

  // Download a saved (single-session) Excel from the report doc
  const downloadExcel = async (report: any) => {
    if (!report.excelBase64) {
      if (Platform.OS === 'web') window.alert('No Excel file found.');
      else Alert.alert('No File', 'No Excel file found.');
      return;
    }
    setDownloading(report.id);
    try {
      const fileName = `attendance-${report.courseCode}-${new Date(report.date).toISOString().split('T')[0]}.xlsx`;
      await saveBase64File(report.excelBase64, fileName);
    } catch (err: any) {
      if (Platform.OS !== 'web') Alert.alert('Download Failed', err?.message || 'Could not download.');
    } finally { setDownloading(null); }
  };

  // Download cumulative — built on-the-fly from all reports for that course
  const downloadCumulativeForCourse = async (courseId: string, courseCode: string, courseTitle: string) => {
    setDownloading(`cum_${courseId}`);
    try {
      const courseReports = reports.filter(r => r.courseId === courseId);
      if (courseReports.length === 0) {
        if (Platform.OS === 'web') window.alert('No reports for this course.');
        else Alert.alert('No Reports', 'No reports for this course.');
        return;
      }
      const excelBase64 = buildCumulativeExcel(courseReports, courseCode, courseTitle);
      const fileName = `attendance-${courseCode}-cumulative.xlsx`;
      await saveBase64File(excelBase64, fileName);
    } catch (err: any) {
      console.error(err);
      if (Platform.OS !== 'web') Alert.alert('Download Failed', err?.message || 'Could not download.');
    } finally { setDownloading(null); }
  };

  const saveBase64File = async (base64: string, fileName: string) => {
    if (Platform.OS === 'web') {
      const binary = atob(base64);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
      const blob = new Blob([bytes], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a'); a.href = url; a.download = fileName;
      document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(url);
    } else {
      const FS = require('expo-file-system/legacy');
      const Sharing = require('expo-sharing');
      const fileUri = FS.cacheDirectory + fileName;
      await FS.writeAsStringAsync(fileUri, base64, { encoding: FS.EncodingType.Base64 });
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(fileUri, { mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', dialogTitle: 'Save Report', UTI: 'com.microsoft.excel.xlsx' });
      }
    }
  };

  const requestDeleteReport = async (report: any) => {
    const doRequest = async () => {
      setRequesting(report.id);
      try {
        await addDoc(collection(db, 'notifications'), {
          userId: 'admin',
          type: 'delete_report_request',
          message: `${userData?.title || ''} ${userData?.firstName} ${userData?.lastName} requests to delete the report for ${report.courseCode} — ${report.courseTitle} (${new Date(report.date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}).`,
          reportId: report.id,
          courseId: report.courseId,
          courseCode: report.courseCode,
          courseTitle: report.courseTitle,
          sessionId: report.sessionId,
          requestedBy: `${userData?.title || ''} ${userData?.firstName} ${userData?.lastName}`.trim(),
          requestedById: userData?.uid,
          status: 'pending',
          read: false,
          createdAt: serverTimestamp(),
        });
        setPendingRequests(prev => ({ ...prev, [report.id]: true }));
        if (Platform.OS === 'web') window.alert('Delete request sent to admin for approval.');
        else Alert.alert('Request Sent', 'Delete request sent to admin for approval.');
      } catch (err) {
        console.error(err);
        if (Platform.OS === 'web') window.alert('Failed to send request.');
        else Alert.alert('Error', 'Failed to send request.');
      } finally { setRequesting(null); }
    };

    if (Platform.OS === 'web') {
      if (window.confirm(`Request to delete this report?\n\n${report.courseCode} — ${new Date(report.date).toLocaleDateString('en-GB')}\n\nThis will need admin approval.`)) doRequest();
    } else {
      Alert.alert('Delete Report', `Request to delete this report?`, [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Request Delete', style: 'destructive', onPress: doRequest },
      ]);
    }
  };

  const requestResetCourseReports = async (courseId: string, courseCode: string, courseTitle: string) => {
    const courseReports = reports.filter(r => r.courseId === courseId);
    const doRequest = async () => {
      setRequesting(`course_${courseId}`);
      try {
        await addDoc(collection(db, 'notifications'), {
          userId: 'admin',
          type: 'reset_course_reports_request',
          message: `${userData?.title || ''} ${userData?.firstName} ${userData?.lastName} requests to reset ALL reports for ${courseCode} — ${courseTitle} (${courseReports.length} report${courseReports.length !== 1 ? 's' : ''}).`,
          courseId,
          courseCode,
          courseTitle,
          reportCount: courseReports.length,
          requestedBy: `${userData?.title || ''} ${userData?.firstName} ${userData?.lastName}`.trim(),
          requestedById: userData?.uid,
          status: 'pending',
          read: false,
          createdAt: serverTimestamp(),
        });
        setPendingRequests(prev => ({ ...prev, [`course_${courseId}`]: true }));
        if (Platform.OS === 'web') window.alert('Reset request sent to admin for approval.');
        else Alert.alert('Request Sent', 'Reset request sent to admin for approval.');
      } catch (err) {
        console.error(err);
        if (Platform.OS === 'web') window.alert('Failed to send request.');
        else Alert.alert('Error', 'Failed to send request.');
      } finally { setRequesting(null); }
    };

    if (Platform.OS === 'web') {
      if (window.confirm(`Request to delete ALL ${courseReports.length} reports for ${courseCode}?\n\nThis will also delete all attendance records and sessions.\nRequires admin approval.`)) doRequest();
    } else {
      Alert.alert('Reset All Reports', `Delete ALL ${courseReports.length} reports for ${courseCode}?`, [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Request Reset', style: 'destructive', onPress: doRequest },
      ]);
    }
  };

  const formatDate = (dateStr: string) => {
    if (!dateStr) return 'N/A';
    return new Date(dateStr).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  };

  const sortedStudents = (students: any[]) => [...(students || [])].sort((a, b) => (a.name || '').localeCompare(b.name || ''));

  const filtered = reports.filter(r => {
    const q = searchQuery.toLowerCase();
    return (r.courseCode || '').toLowerCase().includes(q) || (r.courseTitle || '').toLowerCase().includes(q);
  });

  // Group by course for the "By Course" view
  const courseGroups = [...new Set(reports.map(r => r.courseId))].map(courseId => {
    const courseReports = reports.filter(r => r.courseId === courseId);
    const totalPresent = courseReports.reduce((sum, r) => sum + (r.totalPresent || 0), 0);
    const totalPossible = courseReports.reduce((sum, r) => sum + (r.totalEnrolled || 0), 0);
    const avgRate = totalPossible > 0 ? Math.round((totalPresent / totalPossible) * 100) : 0;
    const lastDate = courseReports.reduce((latest, r) => {
      const d = new Date(r.date || 0).getTime();
      return d > latest ? d : latest;
    }, 0);
    return {
      courseId,
      courseCode: courseReports[0]?.courseCode,
      courseTitle: courseReports[0]?.courseTitle,
      count: courseReports.length,
      totalPresent,
      avgRate,
      lastDate: lastDate ? new Date(lastDate) : null,
    };
  });

  const filteredGroups = courseGroups.filter(g => {
    const q = searchQuery.toLowerCase();
    return (g.courseCode || '').toLowerCase().includes(q) || (g.courseTitle || '').toLowerCase().includes(q);
  });

  if (loading) return <View style={s.loadingContainer}><ActivityIndicator size="large" color="#2C3E7A" /></View>;

  return (
    <View style={s.container}>
      {(isWeb || sidebarOpen) && (
        <Sidebar role="lecturer" userName={userData ? `${userData.title || ''} ${userData.firstName} ${userData.lastName}`.trim() : '...'} activeRoute="/screens/lecturer/Reports" />
      )}
      <View style={s.content}>
        <OfflineBanner />
        <View style={[s.topBar, { paddingTop: isWeb ? 22 : 50 }]}>
          {!isWeb && !sidebarOpen && (
            <TouchableOpacity style={s.menuButton} onPress={() => setSidebarOpen(true)}>
              <Ionicons name="menu" size={24} color="#2C3E7A" />
            </TouchableOpacity>
          )}
          {selectedReport && (
            <TouchableOpacity onPress={() => setSelectedReport(null)}>
              <Ionicons name="arrow-back" size={24} color="#2C3E7A" />
            </TouchableOpacity>
          )}
          <Text style={[s.headerTitle, { fontSize: isWeb ? 18 : 15 }]}>
            {selectedReport ? selectedReport.courseCode : 'Reports'}
          </Text>
        </View>

        {!selectedReport ? (
          <>
            {/* View toggle */}
            <View style={s.toggleContainer}>
              <TouchableOpacity
                style={[s.toggleBtn, view === 'all' && s.toggleBtnActive]}
                onPress={() => setView('all')}
              >
                <Ionicons name="list-outline" size={16} color={view === 'all' ? '#fff' : '#2C3E7A'} />
                <Text style={[s.toggleText, view === 'all' && s.toggleTextActive]}>All Sessions</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[s.toggleBtn, view === 'course' && s.toggleBtnActive]}
                onPress={() => setView('course')}
              >
                <Ionicons name="folder-outline" size={16} color={view === 'course' ? '#fff' : '#2C3E7A'} />
                <Text style={[s.toggleText, view === 'course' && s.toggleTextActive]}>By Course</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[s.toggleBtn, view === 'level' && s.toggleBtnActive]}
                onPress={() => { setView('level'); setSelectedLevelFirst(null); setSelectedCourseSecond(null); }}
              >
                <Ionicons name="school-outline" size={16} color={view === 'level' ? '#fff' : '#2C3E7A'} />
                <Text style={[s.toggleText, view === 'level' && s.toggleTextActive]}>By Level</Text>
              </TouchableOpacity>
            </View>

            <View style={s.searchContainer}>
              <View style={s.searchBar}>
                <Ionicons name="search-outline" size={18} color="#999" />
                <TextInput style={s.searchInput} placeholder="Search by course code or title..." placeholderTextColor="#999" value={searchQuery} onChangeText={setSearchQuery} autoCapitalize="none" />
                {searchQuery.length > 0 && <TouchableOpacity onPress={() => setSearchQuery('')}><Ionicons name="close-circle" size={18} color="#999" /></TouchableOpacity>}
              </View>
            </View>

            <View style={s.statsBar}>
              <Text style={s.statsText}>
                {view === 'all'
                  ? `${filtered.length} session${filtered.length !== 1 ? 's' : ''} · ${courseGroups.length} course${courseGroups.length !== 1 ? 's' : ''}`
                  : `${filteredGroups.length} course${filteredGroups.length !== 1 ? 's' : ''} · ${reports.length} total session${reports.length !== 1 ? 's' : ''}`
                }
              </Text>
            </View>

            <ScrollView showsVerticalScrollIndicator={false}
              refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={['#2C3E7A']} tintColor="#2C3E7A" />}>

              {view === 'all' ? (
                /* ── ALL SESSIONS VIEW ── */
                <View style={s.list}>
                  {filtered.length === 0 ? (
                    <View style={s.emptyState}>
                      <Ionicons name="document-text-outline" size={48} color="#D0D0D0" />
                      <Text style={s.emptyTitle}>No Reports Yet</Text>
                      <Text style={s.emptySubtitle}>Reports are generated when you end an attendance session</Text>
                    </View>
                  ) : (
                    filtered.map((report) => {
                      const isPending = pendingRequests[report.id] || pendingRequests[`course_${report.courseId}`];
                      return (
                        <TouchableOpacity key={report.id} style={s.reportCard} onPress={() => setSelectedReport(report)}>
                          <View style={s.reportCardHeader}>
                            <View style={s.courseCodeBadge}><Text style={s.courseCodeText}>{report.courseCode}</Text></View>
                            <Text style={s.reportDate}>{formatDate(report.date)}</Text>
                          </View>
                          <Text style={s.reportCardTitle}>{report.courseTitle}</Text>
                          <View style={s.reportCardStats}>
                            <View style={s.reportStat}><Ionicons name="checkmark-circle" size={14} color="#2C3E7A" /><Text style={s.reportStatText}>{report.totalPresent} present</Text></View>
                            <View style={s.reportStat}><Ionicons name="close-circle" size={14} color="#E74C3C" /><Text style={s.reportStatText}>{report.totalAbsent} absent</Text></View>
                          </View>
                          <View style={s.reportProgressBar}>
                            <View style={[s.reportProgressFill, { width: `${report.attendanceRate || 0}%`, backgroundColor: (report.attendanceRate || 0) >= 75 ? '#2C3E7A' : '#E74C3C' }]} />
                          </View>
                          <View style={s.reportCardFooter}>
                            <Text style={[s.reportRate, { color: (report.attendanceRate || 0) >= 75 ? '#2C3E7A' : '#E74C3C' }]}>{report.attendanceRate}% attendance</Text>
                            <View style={s.reportActions}>
                              <TouchableOpacity
                                style={[s.deleteIconButton, isPending && { backgroundColor: '#FFF3E0' }]}
                                onPress={() => !isPending && requestDeleteReport(report)}
                                disabled={!!isPending || requesting === report.id}
                              >
                                {requesting === report.id
                                  ? <ActivityIndicator size="small" color="#E74C3C" />
                                  : <Ionicons name={isPending ? 'time-outline' : 'trash-outline'} size={16} color={isPending ? '#F39C12' : '#E74C3C'} />
                                }
                              </TouchableOpacity>
                              <TouchableOpacity style={s.downloadIconButton} onPress={() => downloadExcel(report)} disabled={downloading === report.id}>
                                {downloading === report.id ? <ActivityIndicator size="small" color="#2C3E7A" /> : <Ionicons name="download-outline" size={18} color="#2C3E7A" />}
                              </TouchableOpacity>
                              <Ionicons name="chevron-forward" size={18} color="#999" />
                            </View>
                          </View>
                        </TouchableOpacity>
                      );
                    })
                  )}
                </View>
              ) : view === 'course' ? (
                /* ── BY COURSE VIEW ── */
                <View style={s.list}>
                  {filteredGroups.length === 0 ? (
                    <View style={s.emptyState}>
                      <Ionicons name="folder-outline" size={48} color="#D0D0D0" />
                      <Text style={s.emptyTitle}>No Courses</Text>
                    </View>
                  ) : (
                    filteredGroups.map(g => {
                      const isPendingReset = pendingRequests[`course_${g.courseId}`];
                      return (
                        <View key={g.courseId} style={s.courseCard}>
                          <View style={s.reportCardHeader}>
                            <View style={s.courseCodeBadge}><Text style={s.courseCodeText}>{g.courseCode}</Text></View>
                            <View style={s.sessionCountBadge}>
                              <Ionicons name="time-outline" size={12} color="#666" />
                              <Text style={s.sessionCountText}>{g.count} session{g.count !== 1 ? 's' : ''}</Text>
                            </View>
                          </View>
                          <Text style={s.reportCardTitle}>{g.courseTitle}</Text>
                          <View style={s.courseStatsRow}>
                            <View style={s.courseStat}>
                              <Text style={s.courseStatNumber}>{g.totalPresent}</Text>
                              <Text style={s.courseStatLabel}>Total Present</Text>
                            </View>
                            <View style={s.courseStat}>
                              <Text style={[s.courseStatNumber, { color: g.avgRate >= 75 ? '#2C3E7A' : '#E74C3C' }]}>{g.avgRate}%</Text>
                              <Text style={s.courseStatLabel}>Avg Rate</Text>
                            </View>
                            <View style={s.courseStat}>
                              <Text style={s.courseStatNumber}>{g.lastDate ? g.lastDate.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '—'}</Text>
                              <Text style={s.courseStatLabel}>Last Session</Text>
                            </View>
                          </View>
                          <View style={s.courseProgressBar}>
                            <View style={[s.courseProgressFill, { width: `${g.avgRate}%`, backgroundColor: g.avgRate >= 75 ? '#2C3E7A' : '#E74C3C' }]} />
                          </View>
                          <TouchableOpacity
                            style={s.viewSessionsLink}
                            onPress={() => { setView('all'); setSearchQuery(g.courseCode); }}
                          >
                            <Text style={s.viewSessionsText}>See all sessions</Text>
                            <Ionicons name="chevron-forward" size={14} color="#2C3E7A" />
                          </TouchableOpacity>
                          <View style={s.courseActions}>
                            <TouchableOpacity
                              style={s.cumDownloadBtn}
                              onPress={() => downloadCumulativeForCourse(g.courseId, g.courseCode, g.courseTitle)}
                              disabled={downloading === `cum_${g.courseId}`}
                            >
                              {downloading === `cum_${g.courseId}`
                                ? <ActivityIndicator size="small" color="#fff" />
                                : <><Ionicons name="download-outline" size={16} color="#fff" /><Text style={s.cumDownloadText}>Download Full Attendance Sheet</Text></>}
                            </TouchableOpacity>
                            <TouchableOpacity
                              style={[s.resetBtn, isPendingReset && s.resetBtnPending]}
                              onPress={() => !isPendingReset && requestResetCourseReports(g.courseId, g.courseCode, g.courseTitle)}
                              disabled={!!isPendingReset || requesting === `course_${g.courseId}`}
                            >
                              {requesting === `course_${g.courseId}`
                                ? <ActivityIndicator size="small" color="#E74C3C" />
                                : <Ionicons name={isPendingReset ? 'time-outline' : 'refresh-outline'} size={14} color={isPendingReset ? '#F39C12' : '#E74C3C'} />
                              }
                            </TouchableOpacity>
                          </View>
                        </View>
                      );
                    })
                  )}
                </View>
              ) : (
                /* ── BY LEVEL VIEW (cascading: Level → Course → Date) ── */
                <View style={s.list}>
                  {(() => {
                    // Build map: { level: { courseId: { courseInfo, reports: [] } } }
                    const levelMap: Record<string, Record<string, { courseInfo: any; reports: any[] }>> = {};

                    reports.forEach(r => {
                      const courseInfo = coursesData[r.courseId];
                      const level = courseInfo?.level || 'Unspecified';

                      if (!levelMap[level]) levelMap[level] = {};
                      if (!levelMap[level][r.courseId]) {
                        levelMap[level][r.courseId] = {
                          courseInfo: courseInfo || { courseCode: r.courseCode, courseTitle: r.courseTitle },
                          reports: [],
                        };
                      }
                      levelMap[level][r.courseId].reports.push(r);
                    });

                    const levelEntries = Object.keys(levelMap).sort();

                    if (levelEntries.length === 0) {
                      return (
                        <View style={s.emptyState}>
                          <Ionicons name="school-outline" size={48} color="#D0D0D0" />
                          <Text style={s.emptyTitle}>No Reports</Text>
                        </View>
                      );
                    }

                    return (
                      <>
                        {/* STEP 1: Level selector */}
                        <Text style={s.cascadeStepTitle}>1. Select Level</Text>
                        <View style={s.cascadeRow}>
                          {levelEntries.map(lv => (
                            <TouchableOpacity
                              key={lv}
                              style={[s.cascadePill, selectedLevelFirst === lv && s.cascadePillActive]}
                              onPress={() => {
                                setSelectedLevelFirst(lv === selectedLevelFirst ? null : lv);
                                setSelectedCourseSecond(null);
                              }}
                            >
                              <Text style={[s.cascadePillText, selectedLevelFirst === lv && s.cascadePillTextActive]}>
                                {lv === 'Unspecified' ? lv : `${lv} Level`}
                              </Text>
                            </TouchableOpacity>
                          ))}
                        </View>

                        {/* STEP 2: Course selector (only after level chosen) */}
                        {selectedLevelFirst && (
                          <>
                            <Text style={s.cascadeStepTitle}>2. Select Course</Text>
                            <View style={s.cascadeRow}>
                              {Object.entries(levelMap[selectedLevelFirst]).map(([courseId, data]) => (
                                <TouchableOpacity
                                  key={courseId}
                                  style={[s.cascadePill, selectedCourseSecond === courseId && s.cascadePillActive]}
                                  onPress={() => setSelectedCourseSecond(courseId === selectedCourseSecond ? null : courseId)}
                                >
                                  <Text style={[s.cascadePillText, selectedCourseSecond === courseId && s.cascadePillTextActive]}>
                                    {data.courseInfo.courseCode}
                                  </Text>
                                </TouchableOpacity>
                              ))}
                            </View>
                          </>
                        )}

                        {/* STEP 3: Sessions/dates list */}
                        {selectedLevelFirst && selectedCourseSecond && (
                          <>
                            <Text style={s.cascadeStepTitle}>3. Sessions</Text>
                            {(levelMap[selectedLevelFirst][selectedCourseSecond].reports || [])
                              .sort((a: any, b: any) => new Date(b.date || 0).getTime() - new Date(a.date || 0).getTime())
                              .map((report: any) => {
                                const isPending = pendingRequests[report.id] || pendingRequests[`course_${report.courseId}`];
                                return (
                                  <TouchableOpacity key={report.id} style={s.reportCard} onPress={() => setSelectedReport(report)}>
                                    <View style={s.reportCardHeader}>
                                      <View style={s.courseCodeBadge}><Text style={s.courseCodeText}>{report.courseCode}</Text></View>
                                      <Text style={s.reportDate}>{formatDate(report.date)}</Text>
                                    </View>
                                    <Text style={s.reportCardTitle}>{report.courseTitle}</Text>
                                    <View style={s.reportCardStats}>
                                      <View style={s.reportStat}><Ionicons name="checkmark-circle" size={14} color="#2C3E7A" /><Text style={s.reportStatText}>{report.totalPresent} present</Text></View>
                                      <View style={s.reportStat}><Ionicons name="close-circle" size={14} color="#E74C3C" /><Text style={s.reportStatText}>{report.totalAbsent} absent</Text></View>
                                    </View>
                                    <View style={s.reportProgressBar}>
                                      <View style={[s.reportProgressFill, { width: `${report.attendanceRate || 0}%`, backgroundColor: (report.attendanceRate || 0) >= 75 ? '#2C3E7A' : '#E74C3C' }]} />
                                    </View>
                                    <View style={s.reportCardFooter}>
                                      <Text style={[s.reportRate, { color: (report.attendanceRate || 0) >= 75 ? '#2C3E7A' : '#E74C3C' }]}>{report.attendanceRate}% attendance</Text>
                                      <View style={s.reportActions}>
                                        <TouchableOpacity
                                          style={[s.deleteIconButton, isPending && { backgroundColor: '#FFF3E0' }]}
                                          onPress={() => !isPending && requestDeleteReport(report)}
                                          disabled={!!isPending || requesting === report.id}
                                        >
                                          {requesting === report.id
                                            ? <ActivityIndicator size="small" color="#E74C3C" />
                                            : <Ionicons name={isPending ? 'time-outline' : 'trash-outline'} size={16} color={isPending ? '#F39C12' : '#E74C3C'} />}
                                        </TouchableOpacity>
                                        <TouchableOpacity style={s.downloadIconButton} onPress={() => downloadExcel(report)} disabled={downloading === report.id}>
                                          {downloading === report.id ? <ActivityIndicator size="small" color="#2C3E7A" /> : <Ionicons name="download-outline" size={18} color="#2C3E7A" />}
                                        </TouchableOpacity>
                                        <Ionicons name="chevron-forward" size={18} color="#999" />
                                      </View>
                                    </View>
                                  </TouchableOpacity>
                                );
                              })}
                          </>
                        )}
                      </>
                    );
                  })()}
                </View>
              )}
            </ScrollView>
          </>
        ) : (
          /* ── DETAIL VIEW (single session) ── */
          <ScrollView showsVerticalScrollIndicator={false}>
            <View style={s.detailContainer}>
              <View style={s.reportDetailCard}>
                <View style={s.reportDetailHeader}>
                  <View style={s.courseCodeBadge}><Text style={s.courseCodeText}>{selectedReport.courseCode}</Text></View>
                  <Text style={s.reportDate}>{formatDate(selectedReport.date)}</Text>
                </View>
                <Text style={s.reportDetailTitle}>{selectedReport.courseTitle}</Text>
                <View style={s.statsRow}>
                  <View style={s.statBox}><Text style={s.statNumber}>{selectedReport.totalEnrolled}</Text><Text style={s.statLabel}>Enrolled</Text></View>
                  <View style={[s.statBox, { borderColor: '#2C3E7A' }]}><Text style={[s.statNumber, { color: '#2C3E7A' }]}>{selectedReport.totalPresent}</Text><Text style={s.statLabel}>Present</Text></View>
                  <View style={[s.statBox, { borderColor: '#E74C3C' }]}><Text style={[s.statNumber, { color: '#E74C3C' }]}>{selectedReport.totalAbsent}</Text><Text style={s.statLabel}>Absent</Text></View>
                  <View style={[s.statBox, { borderColor: selectedReport.attendanceRate >= 75 ? '#2C3E7A' : '#E74C3C' }]}>
                    <Text style={[s.statNumber, { color: selectedReport.attendanceRate >= 75 ? '#2C3E7A' : '#E74C3C' }]}>{selectedReport.attendanceRate}%</Text><Text style={s.statLabel}>Rate</Text>
                  </View>
                </View>
                <View style={s.detailActions}>
                  <TouchableOpacity style={s.downloadButton} onPress={() => downloadExcel(selectedReport)} disabled={downloading === selectedReport.id}>
                    {downloading === selectedReport.id ? <ActivityIndicator size="small" color="#fff" />
                      : <><Ionicons name="download-outline" size={18} color="#fff" /><Text style={s.downloadButtonText}>Download This Session</Text></>}
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[s.deleteButton, (pendingRequests[selectedReport.id] || pendingRequests[`course_${selectedReport.courseId}`]) && s.deleteButtonPending]}
                    onPress={() => requestDeleteReport(selectedReport)}
                    disabled={!!(pendingRequests[selectedReport.id] || pendingRequests[`course_${selectedReport.courseId}`]) || requesting === selectedReport.id}
                  >
                    {requesting === selectedReport.id ? <ActivityIndicator size="small" color="#E74C3C" />
                      : <><Ionicons name={(pendingRequests[selectedReport.id] || pendingRequests[`course_${selectedReport.courseId}`]) ? 'time-outline' : 'trash-outline'} size={18} color={(pendingRequests[selectedReport.id] || pendingRequests[`course_${selectedReport.courseId}`]) ? '#F39C12' : '#E74C3C'} />
                        <Text style={[s.deleteButtonText, (pendingRequests[selectedReport.id] || pendingRequests[`course_${selectedReport.courseId}`]) && { color: '#F39C12' }]}>
                          {(pendingRequests[selectedReport.id] || pendingRequests[`course_${selectedReport.courseId}`]) ? 'Pending' : 'Delete'}
                        </Text></>}
                  </TouchableOpacity>
                </View>
              </View>

              <View style={s.studentListCard}>
                <Text style={s.presentTitle}>Present Students ({selectedReport.presentStudents?.length || 0})</Text>
                {selectedReport.presentStudents?.length === 0 ? <Text style={s.emptyListText}>No students were present</Text>
                  : sortedStudents(selectedReport.presentStudents).map((st: any, i: number) => (
                    <View key={st.uid || i} style={s.studentRow}><View style={s.studentNumber}><Text style={s.studentNumberText}>{i + 1}</Text></View><View style={s.studentInfo}><Text style={s.studentName}>{st.name?.toUpperCase()}</Text><Text style={s.studentMeta}>{st.matricNumber} · {st.department}</Text></View><View style={s.presentBadge}><Text style={s.presentBadgeText}>PRESENT</Text></View></View>
                  ))}
              </View>
              <View style={s.studentListCard}>
                <Text style={s.absentTitle}>Absent Students ({selectedReport.absentStudents?.length || 0})</Text>
                {selectedReport.absentStudents?.length === 0 ? <Text style={s.emptyListText}>No students were absent</Text>
                  : sortedStudents(selectedReport.absentStudents).map((st: any, i: number) => (
                    <View key={st.uid || i} style={s.studentRow}><View style={s.studentNumber}><Text style={s.studentNumberText}>{i + 1}</Text></View><View style={s.studentInfo}><Text style={s.studentName}>{st.name?.toUpperCase()}</Text><Text style={s.studentMeta}>{st.matricNumber} · {st.department}</Text></View><View style={s.absentBadge}><Text style={s.absentBadgeText}>ABSENT</Text></View></View>
                  ))}
              </View>
            </View>
          </ScrollView>
        )}
      </View>
      {sidebarOpen && !isWeb && <TouchableOpacity style={s.overlay} onPress={() => setSidebarOpen(false)} />}
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, flexDirection: 'row', backgroundColor: '#F5F6FA' },
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#F5F6FA' },
  content: { flex: 1, overflow: 'hidden', minWidth: 0 },
  topBar: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', paddingHorizontal: 24, paddingVertical: 22, borderBottomWidth: 1, borderBottomColor: '#E0E0E0', gap: 12, minHeight: 64 },
  menuButton: { width: 40, height: 40, borderRadius: 8, backgroundColor: '#F5F6FA', justifyContent: 'center', alignItems: 'center' },
  headerTitle: { fontWeight: 'bold', color: '#2C3E7A', flex: 1 },
  toggleContainer: { flexDirection: 'row', flexWrap: 'wrap', padding: 16, paddingBottom: 0, gap: 8 },
  toggleBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 10, borderRadius: 8, borderWidth: 1, borderColor: '#2C3E7A', gap: 6, backgroundColor: '#fff' },
  cascadeStepTitle: { fontSize: 13, fontWeight: '700', color: '#2C3E7A', marginTop: 12, marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.5 },
  cascadeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 8 },
  cascadePill: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, borderWidth: 1, borderColor: '#2C3E7A', backgroundColor: '#fff' },
  cascadePillActive: { backgroundColor: '#2C3E7A' },
  cascadePillText: { color: '#2C3E7A', fontWeight: '600', fontSize: 13 },
  cascadePillTextActive: { color: '#fff' },
  toggleBtnActive: { backgroundColor: '#2C3E7A' },
  toggleText: { color: '#2C3E7A', fontWeight: '600', fontSize: 13 },
  toggleTextActive: { color: '#fff' },
  searchContainer: { padding: 16, paddingBottom: 8 },
  searchBar: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', borderRadius: 10, paddingHorizontal: 14, paddingVertical: 10, borderWidth: 1, borderColor: '#E0E0E0', gap: 8 },
  searchInput: { flex: 1, fontSize: 14, color: '#2D3436', outlineStyle: 'none' as any },
  statsBar: { backgroundColor: '#fff', paddingHorizontal: 24, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: '#F0F0F0', marginBottom: 4 },
  statsText: { fontSize: 13, color: '#666' },
  list: { padding: 16, gap: 10 },
  emptyState: { alignItems: 'center', paddingVertical: 60, gap: 12 },
  emptyTitle: { fontSize: 18, fontWeight: 'bold', color: '#2C3E7A' },
  emptySubtitle: { fontSize: 14, color: '#666', textAlign: 'center', paddingHorizontal: 40 },
  reportCard: { backgroundColor: '#fff', borderRadius: 12, padding: 20, borderLeftWidth: 4, borderLeftColor: '#2C3E7A', shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.06, shadowRadius: 4, elevation: 2, gap: 8, marginBottom: 8 },
  courseCard: { backgroundColor: '#fff', borderRadius: 12, padding: 20, borderLeftWidth: 4, borderLeftColor: '#2C3E7A', shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.06, shadowRadius: 4, elevation: 2, gap: 12, marginBottom: 8 },
  reportCardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  courseCodeBadge: { backgroundColor: '#EEF2FF', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 6 },
  courseCodeText: { color: '#2C3E7A', fontWeight: '700', fontSize: 13 },
  sessionCountBadge: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#F5F6FA', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6, gap: 4 },
  sessionCountText: { fontSize: 11, color: '#666', fontWeight: '600' },
  reportDate: { fontSize: 12, color: '#999' },
  reportCardTitle: { fontSize: 15, fontWeight: '700', color: '#2D3436' },
  reportCardStats: { flexDirection: 'row', gap: 16 },
  reportStat: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  reportStatText: { fontSize: 12, color: '#666' },
  reportProgressBar: { height: 6, backgroundColor: '#E0E0E0', borderRadius: 3, overflow: 'hidden' },
  reportProgressFill: { height: '100%', borderRadius: 3 },
  reportCardFooter: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  reportRate: { fontSize: 13, fontWeight: '600' },
  reportActions: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  deleteIconButton: { width: 36, height: 36, borderRadius: 8, backgroundColor: '#FDEDEC', justifyContent: 'center', alignItems: 'center' },
  downloadIconButton: { width: 36, height: 36, borderRadius: 8, backgroundColor: '#EEF2FF', justifyContent: 'center', alignItems: 'center' },
  // Course view
  courseStatsRow: { flexDirection: 'row', justifyContent: 'space-around', paddingVertical: 8 },
  courseStat: { alignItems: 'center', gap: 2, flex: 1 },
  courseStatNumber: { fontSize: 18, fontWeight: 'bold', color: '#2C3E7A' },
  courseStatLabel: { fontSize: 11, color: '#666' },
  courseProgressBar: { height: 6, backgroundColor: '#E0E0E0', borderRadius: 3, overflow: 'hidden' },
  courseProgressFill: { height: '100%', borderRadius: 3 },
  viewSessionsLink: { flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: 4 },
  viewSessionsText: { fontSize: 12, color: '#2C3E7A', fontWeight: '600' },
  courseActions: { flexDirection: 'row', gap: 8, marginTop: 4 },
  cumDownloadBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', backgroundColor: '#2C3E7A', paddingVertical: 12, borderRadius: 8, gap: 6 },
  cumDownloadText: { color: '#fff', fontWeight: '600', fontSize: 13 },
  resetBtn: { width: 44, height: 44, borderRadius: 8, borderWidth: 1, borderColor: '#E74C3C', justifyContent: 'center', alignItems: 'center', backgroundColor: '#FDEDEC' },
  resetBtnPending: { borderColor: '#F39C12', backgroundColor: '#FFF3E0' },
  // Detail view
  detailContainer: { padding: 16, gap: 16 },
  reportDetailCard: { backgroundColor: '#fff', borderRadius: 16, padding: 20, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.08, shadowRadius: 8, elevation: 4, gap: 12 },
  reportDetailHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  reportDetailTitle: { fontSize: 18, fontWeight: 'bold', color: '#2C3E7A' },
  statsRow: { flexDirection: 'row', gap: 12 },
  statBox: { flex: 1, alignItems: 'center', padding: 12, borderRadius: 10, borderWidth: 2, borderColor: '#E0E0E0', gap: 4 },
  statNumber: { fontSize: 22, fontWeight: 'bold', color: '#2D3436' },
  statLabel: { fontSize: 11, color: '#666' },
  detailActions: { flexDirection: 'row', gap: 10 },
  downloadButton: { flex: 2, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', backgroundColor: '#2C3E7A', padding: 14, borderRadius: 10, gap: 8 },
  downloadButtonText: { color: '#fff', fontWeight: '700', fontSize: 14 },
  deleteButton: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', padding: 14, borderRadius: 10, borderWidth: 1.5, borderColor: '#E74C3C', gap: 6 },
  deleteButtonPending: { borderColor: '#F39C12', backgroundColor: '#FFF3E0' },
  deleteButtonText: { color: '#E74C3C', fontWeight: '600', fontSize: 13 },
  studentListCard: { backgroundColor: '#fff', borderRadius: 16, padding: 20, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.08, shadowRadius: 8, elevation: 4, gap: 12 },
  presentTitle: { fontSize: 15, fontWeight: 'bold', color: '#2C3E7A' },
  absentTitle: { fontSize: 15, fontWeight: 'bold', color: '#E74C3C' },
  emptyListText: { fontSize: 14, color: '#999', textAlign: 'center', paddingVertical: 16 },
  studentRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#F5F6FA', gap: 12 },
  studentNumber: { width: 28, height: 28, borderRadius: 14, backgroundColor: '#EEF2FF', justifyContent: 'center', alignItems: 'center' },
  studentNumberText: { fontSize: 12, fontWeight: '700', color: '#2C3E7A' },
  studentInfo: { flex: 1 },
  studentName: { fontSize: 14, fontWeight: '600', color: '#2D3436' },
  studentMeta: { fontSize: 11, color: '#666', marginTop: 2 },
  presentBadge: { backgroundColor: '#EEF2FF', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  presentBadgeText: { color: '#2C3E7A', fontSize: 11, fontWeight: '700' },
  absentBadge: { backgroundColor: '#FDEDEC', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  absentBadgeText: { color: '#E74C3C', fontSize: 11, fontWeight: '700' },
  overlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.5)', zIndex: 10 },
});
