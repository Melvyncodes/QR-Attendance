import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { collection, doc, getDocs, query, updateDoc, where } from 'firebase/firestore';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View
} from 'react-native';
import { db } from '../../../firebase';

/**
 * ONE-TIME ADMIN TOOL
 * Finds sessions stuck with status='active' whose qrExpiry has passed
 * (orphans from the auto-end bug) and lets admin close them in bulk.
 */
export default function CleanupOrphanedSessions() {
  const [loading, setLoading] = useState(true);
  const [orphans, setOrphans] = useState<any[]>([]);
  const [allActive, setAllActive] = useState<any[]>([]);
  const [closing, setClosing] = useState(false);

  const scan = async () => {
    setLoading(true);
    try {
      const snap = await getDocs(query(collection(db, 'sessions'), where('status', '==', 'active')));
      const list = snap.docs.map(d => ({ id: d.id, ...d.data() } as any));
      setAllActive(list);

      const now = Date.now();
      const expired = list.filter(s => {
        if (!s.qrExpiry) return true; // missing expiry = orphan
        return new Date(s.qrExpiry).getTime() < now;
      });
      setOrphans(expired);
    } catch (err) { console.error(err); }
    finally { setLoading(false); }
  };

  useEffect(() => { scan(); }, []);

  const closeAll = async () => {
    const doIt = async () => {
      setClosing(true);
      try {
        await Promise.all(
          orphans.map(s =>
            updateDoc(doc(db, 'sessions', s.id), {
              status: 'closed',
              endTime: new Date().toISOString(),
              autoClosedByCleanup: true,
            }).catch(() => { })
          )
        );
        await scan();
        if (Platform.OS === 'web') window.alert(`Closed ${orphans.length} orphaned session(s).`);
        else Alert.alert('Done', `Closed ${orphans.length} orphaned session(s).`);
      } catch (err) {
        console.error(err);
      } finally { setClosing(false); }
    };

    if (Platform.OS === 'web') {
      if (window.confirm(`Close ${orphans.length} orphaned session(s)? They will be marked as 'closed' in Firestore.`)) doIt();
    } else {
      Alert.alert('Cleanup Sessions', `Close ${orphans.length} orphaned session(s)?`, [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Close All', style: 'destructive', onPress: doIt },
      ]);
    }
  };

  return (
    <View style={s.container}>
      <View style={s.topBar}>
        <TouchableOpacity onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={24} color="#2C3E7A" />
        </TouchableOpacity>
        <Text style={s.headerTitle}>Cleanup Orphaned Sessions</Text>
        <TouchableOpacity onPress={scan} disabled={loading}>
          <Ionicons name="refresh-outline" size={22} color="#2C3E7A" />
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={s.content}>
        <View style={s.statsRow}>
          <View style={s.statBox}>
            <Text style={s.statNumber}>{allActive.length}</Text>
            <Text style={s.statLabel}>Sessions marked active</Text>
          </View>
          <View style={[s.statBox, { borderColor: '#E74C3C' }]}>
            <Text style={[s.statNumber, { color: '#E74C3C' }]}>{orphans.length}</Text>
            <Text style={s.statLabel}>Orphaned (expired)</Text>
          </View>
        </View>

        {loading ? (
          <ActivityIndicator size="large" color="#2C3E7A" style={{ marginTop: 32 }} />
        ) : orphans.length === 0 ? (
          <View style={s.emptyState}>
            <Ionicons name="checkmark-circle-outline" size={48} color="#27AE60" />
            <Text style={s.emptyTitle}>No orphaned sessions!</Text>
            <Text style={s.emptyText}>All active sessions are legitimately running.</Text>
          </View>
        ) : (
          <>
            <Text style={s.sectionTitle}>Orphaned sessions (expired but still marked active):</Text>
            {orphans.map(o => (
              <View key={o.id} style={s.orphanCard}>
                <View style={s.orphanHeader}>
                  <View style={s.codeBadge}><Text style={s.codeText}>{o.courseCode || '??'}</Text></View>
                  <Text style={s.lecturerText}>{o.lecturerName || 'Unknown'}</Text>
                </View>
                <Text style={s.titleText}>{o.courseTitle || 'No title'}</Text>
                <Text style={s.metaText}>
                  Expired: {o.qrExpiry ? new Date(o.qrExpiry).toLocaleString('en-GB') : 'No expiry set'}
                </Text>
                <Text style={s.idText}>ID: {o.id}</Text>
              </View>
            ))}

            <TouchableOpacity style={s.closeBtn} onPress={closeAll} disabled={closing}>
              {closing
                ? <ActivityIndicator color="#fff" />
                : <>
                  <Ionicons name="close-circle-outline" size={20} color="#fff" />
                  <Text style={s.closeBtnText}>Close All {orphans.length} Orphaned Session(s)</Text>
                </>
              }
            </TouchableOpacity>
          </>
        )}
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F5F6FA' },
  topBar: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', paddingHorizontal: 24, paddingVertical: 16, paddingTop: 50, borderBottomWidth: 1, borderBottomColor: '#E0E0E0', gap: 12 },
  headerTitle: { fontSize: 16, fontWeight: 'bold', color: '#2C3E7A', flex: 1 },
  content: { padding: 16, gap: 12 },
  statsRow: { flexDirection: 'row', gap: 12 },
  statBox: { flex: 1, alignItems: 'center', padding: 16, borderRadius: 12, borderWidth: 2, borderColor: '#2C3E7A', backgroundColor: '#fff', gap: 4 },
  statNumber: { fontSize: 26, fontWeight: 'bold', color: '#2C3E7A' },
  statLabel: { fontSize: 11, color: '#666', textAlign: 'center' },
  sectionTitle: { fontSize: 13, fontWeight: '700', color: '#2C3E7A', marginTop: 8, marginBottom: 4, textTransform: 'uppercase' },
  orphanCard: { backgroundColor: '#fff', padding: 14, borderRadius: 10, borderLeftWidth: 4, borderLeftColor: '#E74C3C', gap: 4 },
  orphanHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  codeBadge: { backgroundColor: '#FDEDEC', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  codeText: { color: '#E74C3C', fontWeight: '700', fontSize: 12 },
  lecturerText: { fontSize: 12, color: '#666' },
  titleText: { fontSize: 14, fontWeight: '600', color: '#2D3436' },
  metaText: { fontSize: 11, color: '#999' },
  idText: { fontSize: 10, color: '#BBB', fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace' },
  closeBtn: { flexDirection: 'row', backgroundColor: '#E74C3C', padding: 16, borderRadius: 12, alignItems: 'center', justifyContent: 'center', gap: 8, marginTop: 16 },
  closeBtnText: { color: '#fff', fontWeight: '700', fontSize: 14 },
  emptyState: { alignItems: 'center', padding: 40, gap: 12 },
  emptyTitle: { fontSize: 18, fontWeight: 'bold', color: '#27AE60' },
  emptyText: { fontSize: 13, color: '#666', textAlign: 'center' },
});
