/**
 * Admin Reports
 * Level 1 — All levels (100/200/...)
 * Level 2 — Programs (departments) under that level
 * Level 3 — Courses under that program
 * Level 4 — Lecturers teaching that course
 * Level 5 — Sessions under that lecturer/course
 * Level 6 — Full report detail
 */

import OfflineBanner from '@/components/OfflineBanner';
import Sidebar from '@/components/Sidebar';
import { useUser } from '@/context/UserContext';
import { useResponsive } from '@/hooks/useResponsive';
import { Ionicons } from '@expo/vector-icons';
import { collection, getDocs } from 'firebase/firestore';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Platform,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { db } from '../../../firebase';

type ViewLevel = 'levels' | 'programs' | 'courses' | 'lecturers' | 'sessions' | 'detail';

export default function AdminReports() {
  const { isWeb } = useResponsive();
  const { userData } = useUser();
  const [sidebarOpen, setSidebarOpen] = useState(isWeb);
  const [reports, setReports] = useState<any[]>([]);
  const [coursesData, setCoursesData] = useState<Record<string, any>>({});
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [downloading, setDownloading] = useState<string | null>(null);

  // Navigation
  const [level, setLevel] = useState<ViewLevel>('levels');
  const [selectedLevel, setSelectedLevel] = useState<string | null>(null);
  const [selectedProgram, setSelectedProgram] = useState<string | null>(null);
  const [selectedCourse, setSelectedCourse] = useState<{ code: string; title: string; courseId?: string } | null>(null);
  const [selectedLecturer, setSelectedLecturer] = useState<{ id: string; name: string } | null>(null);
  const [selectedReport, setSelectedReport] = useState<any>(null);

  const fetchReports = async () => {
    try {
      const [reportsSnap, coursesSnap] = await Promise.all([
        getDocs(collection(db, 'reports')),
        getDocs(collection(db, 'courses')),
      ]);
      const list = reportsSnap.docs
        .map(d => ({ id: d.id, ...d.data() }))
        .sort((a: any, b: any) => new Date(b.date || 0).getTime() - new Date(a.date || 0).getTime());
      setReports(list);

      const courseMap: Record<string, any> = {};
      coursesSnap.docs.forEach(d => { courseMap[d.id] = { id: d.id, ...d.data() }; });
      setCoursesData(courseMap);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => { fetchReports(); }, []);
  const onRefresh = () => { setRefreshing(true); fetchReports(); };

  // ── Helper: get level + dept for a report (joined via courseId) ────────
  const getReportLevel = (r: any): string => {
    const c = coursesData[r.courseId];
    return c?.level ? `${c.level}` : 'Unspecified';
  };
  const getReportProgram = (r: any): string => {
    const c = coursesData[r.courseId];
    return c?.department || 'Unspecified';
  };

  // ── Level 1: All unique levels ──
  const allLevels = (() => {
    const set = new Set<string>();
    reports.forEach(r => set.add(getReportLevel(r)));
    return Array.from(set).sort((a, b) => {
      if (a === 'Unspecified') return 1;
      if (b === 'Unspecified') return -1;
      return parseInt(a) - parseInt(b);
    });
  })();

  // ── Level 2: Programs within selected level ──
  const programsForLevel = selectedLevel
    ? (() => {
      const filtered = reports.filter(r => getReportLevel(r) === selectedLevel);
      const map: Record<string, any[]> = {};
      filtered.forEach(r => {
        const p = getReportProgram(r);
        if (!map[p]) map[p] = [];
        map[p].push(r);
      });
      return Object.entries(map).sort(([a], [b]) => a.localeCompare(b));
    })()
    : [];

  // ── Level 3: Courses within selected program ──
  const coursesForProgram = selectedLevel && selectedProgram
    ? (() => {
      const filtered = reports.filter(
        r => getReportLevel(r) === selectedLevel && getReportProgram(r) === selectedProgram
      );
      const seen = new Set<string>();
      const groups: { code: string; title: string; courseId: string; reports: any[] }[] = [];
      for (const r of filtered) {
        if (!seen.has(r.courseCode)) {
          seen.add(r.courseCode);
          groups.push({
            code: r.courseCode,
            title: r.courseTitle,
            courseId: r.courseId,
            reports: filtered.filter(x => x.courseCode === r.courseCode),
          });
        }
      }
      return groups.sort((a, b) => a.code.localeCompare(b.code));
    })()
    : [];

  // ── Level 4: Lecturers teaching the selected course ──
  const lecturersForCourse = selectedCourse
    ? (() => {
      const filtered = reports.filter(r => r.courseCode === selectedCourse.code);
      const seen = new Set<string>();
      const groups: { id: string; name: string; reports: any[]; courseCount: number }[] = [];
      for (const r of filtered) {
        const lid = r.lecturerId;
        if (!seen.has(lid)) {
          seen.add(lid);
          const lReports = filtered.filter(x => x.lecturerId === lid);
          groups.push({
            id: lid,
            name: r.lecturerName || 'Unknown Lecturer',
            reports: lReports,
            courseCount: 1,
          });
        }
      }
      return groups.sort((a, b) => a.name.localeCompare(b.name));
    })()
    : [];

  // ── Group by lecturer (legacy, kept for sessions filter) 
  const lecturerGroups: { id: string; name: string; reports: any[]; courseCount: number }[] = [];
  const seenLecturers = new Set<string>();
  for (const r of reports) {
    const lid = r.lecturerId;
    if (!seenLecturers.has(lid)) {
      seenLecturers.add(lid);
      const lReports = reports.filter(x => x.lecturerId === lid);
      const courses = new Set(lReports.map(x => x.courseCode));
      lecturerGroups.push({
        id: lid,
        name: r.lecturerName || 'Unknown Lecturer',
        reports: lReports,
        courseCount: courses.size,
      });
    }
  }

  // ── Courses under selected lecturer 
  const coursesForLecturer = selectedLecturer
    ? (() => {
      const lReports = reports.filter(r => r.lecturerId === selectedLecturer.id);
      const seen = new Set<string>();
      const groups: { code: string; title: string; reports: any[] }[] = [];
      for (const r of lReports) {
        if (!seen.has(r.courseCode)) {
          seen.add(r.courseCode);
          groups.push({
            code: r.courseCode,
            title: r.courseTitle,
            reports: lReports.filter(x => x.courseCode === r.courseCode),
          });
        }
      }
      return groups;
    })()
    : [];

  // ── Sessions under selected course (for selected lecturer) 
  const sessionsForCourse = selectedLecturer && selectedCourse
    ? reports.filter(r => r.lecturerId === selectedLecturer.id && r.courseCode === selectedCourse.code)
    : [];

  // ── Download 
  const downloadExcel = async (report: any) => {
    if (!report.excelBase64) {
      const msg = 'No file found for this report.';
      if (Platform.OS === 'web') window.alert(msg);
      else Alert.alert('No File', msg);
      return;
    }
    setDownloading(report.id);
    try {
      const fileName = `attendance-${report.courseCode}-${new Date(report.date).toISOString().split('T')[0]}.xlsx`;
      if (Platform.OS === 'web') {
        const binary = atob(report.excelBase64);
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
        const blob = new Blob([bytes], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url; a.download = fileName;
        document.body.appendChild(a); a.click();
        document.body.removeChild(a); URL.revokeObjectURL(url);
      } else {
        const FS = require('expo-file-system/legacy');
        const Sharing = require('expo-sharing');
        const fileUri = FS.cacheDirectory + fileName;
        await FS.writeAsStringAsync(fileUri, report.excelBase64, { encoding: FS.EncodingType.Base64 });
        if (await Sharing.isAvailableAsync()) {
          await Sharing.shareAsync(fileUri, {
            mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            dialogTitle: 'Save Report', UTI: 'com.microsoft.excel.xlsx',
          });
        }
      }
    } catch (err: any) {
      if (Platform.OS !== 'web') Alert.alert('Download Failed', err?.message || 'Could not download.');
    } finally {
      setDownloading(null);
    }
  };

  const formatDate = (dateStr: string) => {
    if (!dateStr) return 'N/A';
    return new Date(dateStr).toLocaleDateString('en-GB', {
      day: 'numeric', month: 'short', year: 'numeric',
      hour: '2-digit', minute: '2-digit',
    });
  };

  const formatDateShort = (dateStr: string) => {
    if (!dateStr) return '';
    return new Date(dateStr).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
  };

  const sortedStudents = (students: any[]) =>
    [...(students || [])].sort((a, b) => (a.name || '').localeCompare(b.name || ''));

  // ── Back navigation ───────────────────────────────────────────────────────
  const goBack = () => {
    if (level === 'detail') { setLevel('sessions'); setSelectedReport(null); }
    else if (level === 'sessions') { setLevel('lecturers'); setSelectedLecturer(null); }
    else if (level === 'lecturers') { setLevel('courses'); setSelectedCourse(null); }
    else if (level === 'courses') { setLevel('programs'); setSelectedProgram(null); }
    else if (level === 'programs') { setLevel('levels'); setSelectedLevel(null); }
  };

  const headerTitle =
    level === 'levels' ? 'Reports' :
      level === 'programs' ? `${selectedLevel === 'Unspecified' ? selectedLevel : selectedLevel + ' Level'}` :
        level === 'courses' ? selectedProgram || 'Programs' :
          level === 'lecturers' ? `${selectedCourse?.code} - Lecturers` :
            level === 'sessions' ? `${selectedLecturer?.name || 'Sessions'}` :
              selectedReport?.courseCode;

  if (loading) {
    return <View style={s.loadingContainer}><ActivityIndicator size="large" color="#2C3E7A" /></View>;
  }

  return (
    <View style={s.container}>
      {(isWeb || sidebarOpen) && (
        <Sidebar
          role="admin"
          userName={userData ? `${userData.firstName} ${userData.lastName}` : 'Admin'}
          activeRoute="/screens/admin/Reports"
        />
      )}

      <View style={s.content}>
        <OfflineBanner />

        <View style={s.topBar}>
          {!isWeb && (
            <TouchableOpacity style={s.menuButton} onPress={() => setSidebarOpen(!sidebarOpen)}>
              <Ionicons name={sidebarOpen ? 'close' : 'menu'} size={24} color="#2C3E7A" />
            </TouchableOpacity>
          )}
          {level !== 'lecturers' && (
            <TouchableOpacity onPress={goBack}>
              <Ionicons name="arrow-back" size={24} color="#2C3E7A" />
            </TouchableOpacity>
          )}
          <Text style={s.headerTitle}>{headerTitle}</Text>
          {level === 'detail' && selectedReport && (
            <TouchableOpacity
              style={s.downloadTopBtn}
              onPress={() => downloadExcel(selectedReport)}
              disabled={downloading === selectedReport.id}
            >
              {downloading === selectedReport.id
                ? <ActivityIndicator size="small" color="#fff" />
                : <><Ionicons name="download-outline" size={15} color="#fff" /><Text style={s.downloadTopBtnText}>Excel</Text></>
              }
            </TouchableOpacity>
          )}
        </View>

        {/* ── LEVEL 1: Levels (entry) ───────────────────────────────────── */}
        {level === 'levels' && (
          <ScrollView
            showsVerticalScrollIndicator={false}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={['#2C3E7A']} tintColor="#2C3E7A" />}
          >
            {allLevels.length === 0 ? (
              <View style={s.emptyState}>
                <Ionicons name="bar-chart-outline" size={48} color="#D0D0D0" />
                <Text style={s.emptyTitle}>No Reports Yet</Text>
                <Text style={s.emptySubtitle}>Reports appear here when lecturers end attendance sessions.</Text>
              </View>
            ) : (
              <View style={s.list}>
                <View style={s.statsBar}>
                  <Text style={s.statsText}>{allLevels.length} level{allLevels.length !== 1 ? 's' : ''} · {reports.length} session{reports.length !== 1 ? 's' : ''}</Text>
                </View>
                {allLevels.map(lv => {
                  const count = reports.filter(r => getReportLevel(r) === lv).length;
                  return (
                    <TouchableOpacity
                      key={lv}
                      style={s.lecturerCard}
                      onPress={() => { setSelectedLevel(lv); setLevel('programs'); }}
                    >
                      <View style={s.lecturerCardLeft}>
                        <View style={s.lecturerAvatar}>
                          <Ionicons name="school-outline" size={20} color="#fff" />
                        </View>
                        <View style={{ flex: 1 }}>
                          <Text style={s.lecturerName}>{lv === 'Unspecified' ? lv : `${lv} Level`}</Text>
                          <View style={s.lecturerMeta}>
                            <View style={s.metaPill}>
                              <Ionicons name="time-outline" size={11} color="#2C3E7A" />
                              <Text style={s.metaPillText}>{count} session{count !== 1 ? 's' : ''}</Text>
                            </View>
                          </View>
                        </View>
                      </View>
                      <Ionicons name="chevron-forward" size={18} color="#ccc" />
                    </TouchableOpacity>
                  );
                })}
              </View>
            )}
          </ScrollView>
        )}

        {/* ── LEVEL 2: Programs within selected level ───────────────────── */}
        {level === 'programs' && (
          <ScrollView showsVerticalScrollIndicator={false}>
            <View style={s.list}>
              <View style={s.statsBar}>
                <Text style={s.statsText}>{programsForLevel.length} program{programsForLevel.length !== 1 ? 's' : ''}</Text>
              </View>
              {programsForLevel.map(([prog, progReports]) => (
                <TouchableOpacity
                  key={prog}
                  style={s.lecturerCard}
                  onPress={() => { setSelectedProgram(prog); setLevel('courses'); }}
                >
                  <View style={s.lecturerCardLeft}>
                    <View style={s.lecturerAvatar}>
                      <Ionicons name="business-outline" size={18} color="#fff" />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={s.lecturerName}>{prog}</Text>
                      <View style={s.lecturerMeta}>
                        <View style={s.metaPill}>
                          <Ionicons name="time-outline" size={11} color="#2C3E7A" />
                          <Text style={s.metaPillText}>{progReports.length} session{progReports.length !== 1 ? 's' : ''}</Text>
                        </View>
                      </View>
                    </View>
                  </View>
                  <Ionicons name="chevron-forward" size={18} color="#ccc" />
                </TouchableOpacity>
              ))}
            </View>
          </ScrollView>
        )}

        {/* ── LEVEL 4: Lecturers teaching the selected course ───────────── */}
        {level === 'lecturers' && (
          <ScrollView
            showsVerticalScrollIndicator={false}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={['#2C3E7A']} tintColor="#2C3E7A" />}
          >
            <View style={s.list}>
              <View style={s.statsBar}>
                <Text style={s.statsText}>{lecturersForCourse.length} lecturer{lecturersForCourse.length !== 1 ? 's' : ''} · {selectedCourse?.code}</Text>
              </View>
              {lecturersForCourse.map(lecturer => {
                const avgRate = lecturer.reports.length > 0
                  ? Math.round(lecturer.reports.reduce((sum, r) => sum + (r.attendanceRate || 0), 0) / lecturer.reports.length)
                  : 0;

                return (
                  <TouchableOpacity
                    key={lecturer.id}
                    style={s.lecturerCard}
                    onPress={() => { setSelectedLecturer({ id: lecturer.id, name: lecturer.name }); setLevel('sessions'); }}
                  >
                    <View style={s.lecturerCardLeft}>
                      <View style={s.lecturerAvatar}>
                        <Text style={s.lecturerAvatarText}>{(lecturer.name[0] || 'L').toUpperCase()}</Text>
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={s.lecturerName}>{lecturer.name}</Text>
                        <View style={s.lecturerMeta}>
                          <View style={s.metaPill}>
                            <Ionicons name="time-outline" size={11} color="#2C3E7A" />
                            <Text style={s.metaPillText}>{lecturer.reports.length} session{lecturer.reports.length !== 1 ? 's' : ''}</Text>
                          </View>
                          <View style={[s.metaPill, { backgroundColor: avgRate >= 75 ? '#EAFAF1' : '#FDEDEC' }]}>
                            <Text style={[s.metaPillText, { color: avgRate >= 75 ? '#2C3E7A' : '#E74C3C' }]}>{avgRate}% avg</Text>
                          </View>
                        </View>
                      </View>
                    </View>
                    <Ionicons name="chevron-forward" size={18} color="#ccc" />
                  </TouchableOpacity>
                );
              })}
            </View>
          </ScrollView>
        )}

        {/* ── LEVEL 3: Courses within selected program ──────────────────── */}
        {level === 'courses' && (
          <ScrollView showsVerticalScrollIndicator={false}>
            <View style={s.list}>
              <View style={s.statsBar}>
                <Text style={s.statsText}>{coursesForProgram.length} course{coursesForProgram.length !== 1 ? 's' : ''}</Text>
              </View>
              {coursesForProgram.map(group => {
                const avgRate = group.reports.length > 0
                  ? Math.round(group.reports.reduce((sum, r) => sum + (r.attendanceRate || 0), 0) / group.reports.length)
                  : 0;
                const totalPresent = group.reports.reduce((sum, r) => sum + (r.totalPresent || 0), 0);

                return (
                  <TouchableOpacity
                    key={group.code}
                    style={s.courseCard}
                    onPress={() => { setSelectedCourse({ code: group.code, title: group.title, courseId: group.courseId }); setLevel('lecturers'); }}
                  >
                    <View style={s.courseCardHeader}>
                      <View style={s.courseCodeBadge}>
                        <Text style={s.courseCodeText}>{group.code}</Text>
                      </View>
                      <View style={s.sessionCountBadge}>
                        <Ionicons name="time-outline" size={12} color="#666" />
                        <Text style={s.sessionCountText}>{group.reports.length} session{group.reports.length !== 1 ? 's' : ''}</Text>
                      </View>
                    </View>
                    <Text style={s.courseTitle}>{group.title}</Text>
                    <View style={s.courseStats}>
                      <View style={s.courseStat}>
                        <Text style={s.courseStatNum}>{totalPresent}</Text>
                        <Text style={s.courseStatLbl}>Total Present</Text>
                      </View>
                      <View style={s.courseStatDivider} />
                      <View style={s.courseStat}>
                        <Text style={[s.courseStatNum, { color: avgRate >= 75 ? '#2C3E7A' : '#E74C3C' }]}>{avgRate}%</Text>
                        <Text style={s.courseStatLbl}>Avg Rate</Text>
                      </View>
                      <View style={s.courseStatDivider} />
                      <View style={s.courseStat}>
                        <Text style={s.courseStatNum}>{formatDateShort(group.reports[0]?.date || '')}</Text>
                        <Text style={s.courseStatLbl}>Last Session</Text>
                      </View>
                    </View>
                    <View style={s.progressBar}>
                      <View style={[s.progressFill, { width: `${avgRate}%` as any, backgroundColor: avgRate >= 75 ? '#27ae60' : '#E74C3C' }]} />
                    </View>
                    <View style={s.courseCardFooter}>
                      <Text style={s.seeSessionsText}>See lecturers</Text>
                      <Ionicons name="chevron-forward" size={16} color="#2C3E7A" />
                    </View>
                  </TouchableOpacity>
                );
              })}
            </View>
          </ScrollView>
        )}

        {/* ── LEVEL 2: Courses under lecturer (OLD - unused) ───────── */}
        {false && level === 'courses' && (
          <ScrollView showsVerticalScrollIndicator={false}>
            <View style={s.list}>
              <View style={s.statsBar}>
                <Text style={s.statsText}>{coursesForLecturer.length} course{coursesForLecturer.length !== 1 ? 's' : ''}</Text>
              </View>
              {coursesForLecturer.map(group => {
                const avgRate = group.reports.length > 0
                  ? Math.round(group.reports.reduce((sum, r) => sum + (r.attendanceRate || 0), 0) / group.reports.length)
                  : 0;
                const totalPresent = group.reports.reduce((sum, r) => sum + (r.totalPresent || 0), 0);

                return (
                  <TouchableOpacity
                    key={group.code}
                    style={s.courseCard}
                    onPress={() => { setSelectedCourse({ code: group.code, title: group.title }); setLevel('sessions'); }}
                  >
                    <View style={s.courseCardHeader}>
                      <View style={s.courseCodeBadge}>
                        <Text style={s.courseCodeText}>{group.code}</Text>
                      </View>
                      <View style={s.sessionCountBadge}>
                        <Ionicons name="time-outline" size={12} color="#666" />
                        <Text style={s.sessionCountText}>{group.reports.length} session{group.reports.length !== 1 ? 's' : ''}</Text>
                      </View>
                    </View>
                    <Text style={s.courseTitle}>{group.title}</Text>
                    <View style={s.courseStats}>
                      <View style={s.courseStat}>
                        <Text style={s.courseStatNum}>{totalPresent}</Text>
                        <Text style={s.courseStatLbl}>Total Present</Text>
                      </View>
                      <View style={s.courseStatDivider} />
                      <View style={s.courseStat}>
                        <Text style={[s.courseStatNum, { color: avgRate >= 75 ? '#2C3E7A' : '#E74C3C' }]}>{avgRate}%</Text>
                        <Text style={s.courseStatLbl}>Avg Rate</Text>
                      </View>
                      <View style={s.courseStatDivider} />
                      <View style={s.courseStat}>
                        <Text style={s.courseStatNum}>{formatDateShort(group.reports[0]?.date || '')}</Text>
                        <Text style={s.courseStatLbl}>Last Session</Text>
                      </View>
                    </View>
                    <View style={s.progressBar}>
                      <View style={[s.progressFill, { width: `${avgRate}%` as any, backgroundColor: avgRate >= 75 ? '#27ae60' : '#E74C3C' }]} />
                    </View>
                    <View style={s.courseCardFooter}>
                      <Text style={s.seeSessionsText}>See all sessions</Text>
                      <Ionicons name="chevron-forward" size={16} color="#2C3E7A" />
                    </View>
                  </TouchableOpacity>
                );
              })}
            </View>
          </ScrollView>
        )}

        {/* ── LEVEL 3: Sessions ─────────────────────────────────────────── */}
        {level === 'sessions' && (
          <ScrollView showsVerticalScrollIndicator={false}>
            <View style={s.list}>
              <View style={s.statsBar}>
                <Text style={s.statsText}>{sessionsForCourse.length} session{sessionsForCourse.length !== 1 ? 's' : ''} · {selectedCourse?.code}</Text>
              </View>
              {sessionsForCourse.map((report, idx) => (
                <TouchableOpacity
                  key={report.id}
                  style={s.sessionCard}
                  onPress={() => { setSelectedReport(report); setLevel('detail'); }}
                >
                  <View style={s.sessionCardLeft}>
                    <View style={s.sessionNum}>
                      <Text style={s.sessionNumText}>{sessionsForCourse.length - idx}</Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={s.sessionDate}>{formatDate(report.date)}</Text>
                      <View style={s.sessionStats}>
                        <Text style={s.sessionStat}>
                          <Text style={{ color: '#2C3E7A', fontWeight: '700' }}>{report.totalPresent}</Text>/{report.totalEnrolled} present
                        </Text>
                        <View style={[s.ratePill, { backgroundColor: (report.attendanceRate || 0) >= 75 ? '#EAFAF1' : '#FDEDEC' }]}>
                          <Text style={[s.ratePillText, { color: (report.attendanceRate || 0) >= 75 ? '#2C3E7A' : '#E74C3C' }]}>
                            {report.attendanceRate || 0}%
                          </Text>
                        </View>
                      </View>
                    </View>
                  </View>
                  <Ionicons name="chevron-forward" size={18} color="#ccc" />
                </TouchableOpacity>
              ))}
            </View>
          </ScrollView>
        )}

        {/* ── LEVEL 4: Detail ───────────────────────────────────────────── */}
        {level === 'detail' && selectedReport && (
          <ScrollView showsVerticalScrollIndicator={false}>
            <View style={s.detailContainer}>
              <View style={s.reportDetailCard}>
                <View style={s.reportDetailHeader}>
                  <View style={s.courseCodeBadge}><Text style={s.courseCodeText}>{selectedReport.courseCode}</Text></View>
                  <Text style={s.reportDate}>{formatDate(selectedReport.date)}</Text>
                </View>
                <Text style={s.reportDetailTitle}>{selectedReport.courseTitle}</Text>
                <View style={s.lecturerRow}>
                  <Ionicons name="person-outline" size={14} color="#666" />
                  <Text style={s.lecturerRowText}>{selectedReport.lecturerName}</Text>
                </View>

                <View style={s.statsRow}>
                  {[
                    { num: selectedReport.totalEnrolled, lbl: 'Enrolled', color: '#2D3436' },
                    { num: selectedReport.totalPresent, lbl: 'Present', color: '#2C3E7A' },
                    { num: selectedReport.totalAbsent, lbl: 'Absent', color: '#E74C3C' },
                    { num: `${selectedReport.attendanceRate}%`, lbl: 'Rate', color: (selectedReport.attendanceRate || 0) >= 75 ? '#2C3E7A' : '#E74C3C' },
                  ].map(item => (
                    <View key={item.lbl} style={s.statBox}>
                      <Text style={[s.statNumber, { color: item.color }]}>{item.num}</Text>
                      <Text style={s.statLabel}>{item.lbl}</Text>
                    </View>
                  ))}
                </View>

                <TouchableOpacity style={s.downloadButton} onPress={() => downloadExcel(selectedReport)} disabled={downloading === selectedReport.id}>
                  {downloading === selectedReport.id
                    ? <ActivityIndicator size="small" color="#fff" />
                    : <><Ionicons name="download-outline" size={18} color="#fff" /><Text style={s.downloadButtonText}>Download Excel Report</Text></>
                  }
                </TouchableOpacity>
              </View>

              <View style={s.studentListCard}>
                <Text style={s.presentTitle}>Present ({selectedReport.presentStudents?.length || 0})</Text>
                {!selectedReport.presentStudents?.length
                  ? <Text style={s.emptyListText}>No students were present</Text>
                  : sortedStudents(selectedReport.presentStudents).map((st: any, i: number) => (
                    <View key={st.uid || i} style={s.studentRow}>
                      <View style={s.studentNumber}><Text style={s.studentNumberText}>{i + 1}</Text></View>
                      <View style={s.studentInfo}>
                        <Text style={s.studentName}>{st.name?.toUpperCase()}</Text>
                        <Text style={s.studentMeta}>{st.matricNumber} · {st.department}</Text>
                      </View>
                      <View style={s.presentBadge}><Text style={s.presentBadgeText}>PRESENT</Text></View>
                    </View>
                  ))
                }
              </View>

              <View style={s.studentListCard}>
                <Text style={s.absentTitle}>Absent ({selectedReport.absentStudents?.length || 0})</Text>
                {!selectedReport.absentStudents?.length
                  ? <Text style={s.emptyListText}>All students were present!</Text>
                  : sortedStudents(selectedReport.absentStudents).map((st: any, i: number) => (
                    <View key={st.uid || i} style={s.studentRow}>
                      <View style={s.studentNumber}><Text style={s.studentNumberText}>{i + 1}</Text></View>
                      <View style={s.studentInfo}>
                        <Text style={s.studentName}>{st.name?.toUpperCase()}</Text>
                        <Text style={s.studentMeta}>{st.matricNumber} · {st.department}</Text>
                      </View>
                      <View style={s.absentBadge}><Text style={s.absentBadgeText}>ABSENT</Text></View>
                    </View>
                  ))
                }
              </View>
            </View>
          </ScrollView>
        )}
      </View>

      {sidebarOpen && !isWeb && (
        <TouchableOpacity style={s.overlay} onPress={() => setSidebarOpen(false)} />
      )}
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, flexDirection: 'row', backgroundColor: '#F5F6FA' },
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#F5F6FA' },
  content: { flex: 1, overflow: 'hidden', minWidth: 0 },
  topBar: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', paddingHorizontal: 24, paddingVertical: 16, paddingTop: 22, borderBottomWidth: 1, borderBottomColor: '#E0E0E0', gap: 12, minHeight: 69 },
  menuButton: { width: 40, height: 40, borderRadius: 8, backgroundColor: '#F5F6FA', justifyContent: 'center', alignItems: 'center' },
  headerTitle: { fontSize: 18, fontWeight: 'bold', color: '#2C3E7A', flex: 1 },
  downloadTopBtn: { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: '#2C3E7A', paddingHorizontal: 12, paddingVertical: 7, borderRadius: 8 },
  downloadTopBtnText: { color: '#fff', fontWeight: '700', fontSize: 13 },

  list: { padding: 16, gap: 10 },
  statsBar: { backgroundColor: '#fff', paddingHorizontal: 16, paddingVertical: 10, borderRadius: 10, marginBottom: 4 },
  statsText: { fontSize: 13, color: '#666' },

  // Lecturer cards (level 1)
  lecturerCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', borderRadius: 14, padding: 16, borderLeftWidth: 4, borderLeftColor: '#2C3E7A', shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.06, shadowRadius: 4, elevation: 2, gap: 12 },
  lecturerCardLeft: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 12 },
  lecturerAvatar: { width: 44, height: 44, borderRadius: 22, backgroundColor: '#2C3E7A', justifyContent: 'center', alignItems: 'center' },
  lecturerAvatarText: { color: '#fff', fontSize: 18, fontWeight: 'bold' },
  lecturerName: { fontSize: 15, fontWeight: '700', color: '#2D3436', marginBottom: 6 },
  lecturerMeta: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  metaPill: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: '#EEF2FF', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 10 },
  metaPillText: { fontSize: 11, color: '#2C3E7A', fontWeight: '600' },

  // Course cards (level 2)
  courseCard: { backgroundColor: '#fff', borderRadius: 14, padding: 18, borderLeftWidth: 4, borderLeftColor: '#2C3E7A', shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.06, shadowRadius: 4, elevation: 2, gap: 10 },
  courseCardHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  courseCodeBadge: { backgroundColor: '#EEF2FF', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 6 },
  courseCodeText: { color: '#2C3E7A', fontWeight: '700', fontSize: 13 },
  sessionCountBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: '#F5F6FA', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6 },
  sessionCountText: { fontSize: 12, color: '#666', fontWeight: '600' },
  courseTitle: { fontSize: 15, fontWeight: '700', color: '#2D3436' },
  courseStats: { flexDirection: 'row', alignItems: 'center' },
  courseStat: { flex: 1, alignItems: 'center', gap: 2 },
  courseStatNum: { fontSize: 16, fontWeight: 'bold', color: '#2C3E7A' },
  courseStatLbl: { fontSize: 10, color: '#888' },
  courseStatDivider: { width: 1, height: 30, backgroundColor: '#E0E0E0' },
  progressBar: { height: 5, backgroundColor: '#E0E0E0', borderRadius: 3, overflow: 'hidden' },
  progressFill: { height: '100%', borderRadius: 3 },
  courseCardFooter: { flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: 4 },
  seeSessionsText: { fontSize: 13, color: '#2C3E7A', fontWeight: '600' },

  // Session cards (level 3)
  sessionCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', borderRadius: 12, padding: 16, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.06, shadowRadius: 4, elevation: 2, gap: 12 },
  sessionCardLeft: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 12 },
  sessionNum: { width: 32, height: 32, borderRadius: 16, backgroundColor: '#EEF2FF', justifyContent: 'center', alignItems: 'center' },
  sessionNumText: { fontSize: 13, fontWeight: '700', color: '#2C3E7A' },
  sessionDate: { fontSize: 13, fontWeight: '600', color: '#2D3436', marginBottom: 4 },
  sessionStats: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  sessionStat: { fontSize: 12, color: '#666' },
  ratePill: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 10 },
  ratePillText: { fontSize: 12, fontWeight: '700' },

  // Detail (level 4)
  detailContainer: { padding: 16, gap: 16 },
  reportDetailCard: { backgroundColor: '#fff', borderRadius: 16, padding: 20, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.08, shadowRadius: 8, elevation: 4, gap: 12 },
  reportDetailHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  reportDate: { fontSize: 12, color: '#999' },
  reportDetailTitle: { fontSize: 18, fontWeight: 'bold', color: '#2C3E7A' },
  lecturerRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  lecturerRowText: { fontSize: 13, color: '#666' },
  statsRow: { flexDirection: 'row', gap: 10 },
  statBox: { flex: 1, alignItems: 'center', padding: 12, borderRadius: 10, borderWidth: 1.5, borderColor: '#E0E0E0', gap: 4 },
  statNumber: { fontSize: 20, fontWeight: 'bold', color: '#2D3436' },
  statLabel: { fontSize: 11, color: '#666' },
  downloadButton: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', backgroundColor: '#2C3E7A', padding: 14, borderRadius: 10, gap: 8, marginTop: 4 },
  downloadButtonText: { color: '#fff', fontWeight: '700', fontSize: 15 },
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

  emptyState: { alignItems: 'center', paddingVertical: 80, gap: 12, paddingHorizontal: 40 },
  emptyTitle: { fontSize: 18, fontWeight: 'bold', color: '#2C3E7A' },
  emptySubtitle: { fontSize: 14, color: '#666', textAlign: 'center' },
  overlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.5)', zIndex: 10 },
});
