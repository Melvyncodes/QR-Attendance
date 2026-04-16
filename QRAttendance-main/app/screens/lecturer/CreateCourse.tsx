import Sidebar from '@/components/Sidebar';
import { useUser } from '@/context/UserContext';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { doc, setDoc } from 'firebase/firestore';
import React, { useState } from 'react';
import { useResponsive } from '@/hooks/useResponsive';
import {
  ActivityIndicator,
  Dimensions,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View
} from 'react-native';
import { db } from '../../../firebase';

const isWeb = Dimensions.get('window').width > 768;

const InputField = ({
  label, value, onChangeText, placeholder, keyboardType, autoCapitalize, editable
}: any) => (
  <View>
    <Text style={styles.label}>{label}</Text>
    <TextInput
      style={[styles.input, editable === false && styles.inputDisabled]}
      value={value}
      onChangeText={onChangeText}
      placeholder={placeholder}
      placeholderTextColor="#999"
      keyboardType={keyboardType || 'default'}
      autoCapitalize={autoCapitalize || 'words'}
      editable={editable !== false}
    />
  </View>
);

export default function CreateCourse() {
  const { isWeb } = useResponsive();
  const { userData: lecturerData } = useUser();
  const [courseTitle, setCourseTitle] = useState('');
  const [courseCode, setCourseCode] = useState('');
  const [level, setLevel] = useState('');
  const [semester, setSemester] = useState('');
  const [session, setSession] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [sidebarOpen, setSidebarOpen] = useState(isWeb);

  const generateCourseId = (code: string) => {
    const cleanCode = code.replace(/\s/g, '').toUpperCase();
    const shortId = lecturerData?.uid?.substring(0, 4).toUpperCase() || '0000';
    return `${cleanCode}-${shortId}`;
  };

  const handleCreateCourse = async () => {
    if (!courseTitle || !courseCode || !level || !semester || !session) {
      setError('Please fill in all fields');
      return;
    }

    setLoading(true);
    setError('');
    setSuccess('');

    try {
      const courseId = generateCourseId(courseCode);
      const courseRef = doc(db, 'courses', courseId);
      const lecturerName = `${lecturerData?.title || ''} ${lecturerData?.firstName} ${lecturerData?.lastName}`.trim();

      await setDoc(courseRef, {
        courseTitle,
        courseCode: courseCode.toUpperCase(),
        courseId,
        level,
        semester,
        session,
        department: lecturerData?.department,
        college: lecturerData?.college,
        lecturerId: lecturerData?.uid,
        lecturerName,
        enrolledStudents: [],
        createdAt: new Date().toISOString(),
        status: 'active',
      });

      setSuccess(`Course created! Course ID: ${courseId}`);
      setCourseTitle('');
      setCourseCode('');
      setLevel('');
      setSemester('');
      setSession('');

    } catch (err) {
      setError('Failed to create course. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.container}>

      {/* Sidebar */}
      {(isWeb || sidebarOpen ) && (
        <Sidebar
          role="lecturer"
          userName={lecturerData ? `${lecturerData.title || ''} ${lecturerData.firstName} ${lecturerData.lastName}`.trim() : '...'}
          activeRoute="/screens/lecturer/CreateCourse"
        />
      )}

      {/* Main Content */}
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.content}
      >

        {/* Top Bar */}
        <View style={styles.topBar}>
          {!isWeb && (
            <TouchableOpacity
              style={styles.menuButton}
              onPress={() => setSidebarOpen(!sidebarOpen)}
            >
              <Ionicons
                name={sidebarOpen ? 'close' : 'menu'}
                size={24}
                color="#2C3E7A"
              />
            </TouchableOpacity>
          )}
          <Text style={styles.headerTitle}>Create Course</Text>
        </View>

        <ScrollView
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >

          {/* Form */}
          <View style={styles.form}>
            {error ? <Text style={styles.errorText}>{error}</Text> : null}
            {success ? <Text style={styles.successText}>{success}</Text> : null}

            {/* Auto-filled Info */}
            <Text style={styles.sectionTitle}>Lecturer Information</Text>
            <InputField
              label="Lecturer Name"
              value={lecturerData ? `${lecturerData.title || ''} ${lecturerData.firstName} ${lecturerData.lastName}`.trim() : ''}
              editable={false}
            />
            <InputField
              label="Department"
              value={lecturerData?.department || ''}
              editable={false}
            />
            <InputField
              label="College"
              value={lecturerData?.college || ''}
              editable={false}
            />

            {/* Course Details */}
            <Text style={styles.sectionTitle}>Course Details</Text>

            <InputField
              label="Course Title"
              value={courseTitle}
              onChangeText={setCourseTitle}
              placeholder="e.g. Introduction to Programming"
            />
            <InputField
              label="Course Code"
              value={courseCode}
              onChangeText={(text: string) => setCourseCode(text.toUpperCase())}
              placeholder="e.g. CSC101"
              autoCapitalize="characters"
            />

            {/* Level Selector */}
            <Text style={styles.label}>Level</Text>
            <View style={styles.selectorContainer}>
              {['100', '200', '300', '400', '500'].map((l) => (
                <TouchableOpacity
                  key={l}
                  style={[styles.selectorButton, level === l && styles.selectorActive]}
                  onPress={() => setLevel(l)}
                >
                  <Text style={[styles.selectorText, level === l && styles.selectorTextActive]}>
                    {l}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
            <TextInput
              style={[styles.input, { marginTop: 8 }]}
              value={['100','200','300','400','500'].includes(level) ? '' : level}
              onChangeText={(text) => setLevel(text.replace(/[^0-9]/g, ''))}
              placeholder="Or enter a custom level (e.g. 600, 700)"
              placeholderTextColor="#999"
              keyboardType="numeric"
              maxLength={4}
            />

            {/* Semester Selector */}
            <Text style={styles.label}>Semester</Text>
            <View style={styles.selectorContainer}>
              {['First', 'Second'].map((s) => (
                <TouchableOpacity
                  key={s}
                  style={[styles.selectorButton, semester === s && styles.selectorActive]}
                  onPress={() => setSemester(s)}
                >
                  <Text style={[styles.selectorText, semester === s && styles.selectorTextActive]}>
                    {s}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            {/* Academic Session */}
            <InputField
              label="Academic Session"
              value={session}
              onChangeText={setSession}
              placeholder="e.g. 2025/2026"
              autoCapitalize="none"
            />

            {/* Create Button */}
            <TouchableOpacity
              style={styles.button}
              onPress={handleCreateCourse}
              disabled={loading}
            >
              {loading
                ? <ActivityIndicator color="#fff" />
                : <Text style={styles.buttonText}>Create Course</Text>
              }
            </TouchableOpacity>

            <TouchableOpacity onPress={() => router.back()}>
              <Text style={styles.link}>Back to Dashboard</Text>
            </TouchableOpacity>

          </View>
        </ScrollView>
      </KeyboardAvoidingView>

      {/* Mobile overlay */}
      {sidebarOpen && !isWeb && (
        <TouchableOpacity
          style={styles.overlay}
          onPress={() => setSidebarOpen(false)}
        />
      )}

    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    flexDirection: 'row',
    backgroundColor: '#F5F6FA',
  },
  content: {
    flex: 1,
    overflow: 'hidden',
    minWidth: 0,
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    paddingHorizontal: 24,
    paddingVertical: 22,
    paddingTop: isWeb ? 22 : 50,
    borderBottomWidth: 1,
    borderBottomColor: '#E0E0E0',
    gap: 12,
    minHeight: isWeb ? 64 : 80,
  },
  menuButton: {
    width: 40,
    height: 40,
    borderRadius: 8,
    backgroundColor: '#F5F6FA',
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: isWeb ? 18 : 15,
    fontWeight: 'bold',
    color: '#2C3E7A',
    flex: 1,
  },
  scrollContent: {
    padding: 24,
  },
  form: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 4,
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#2C3E7A',
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginTop: 20,
    marginBottom: 4,
    borderBottomWidth: 1,
    borderBottomColor: '#E0E0E0',
    paddingBottom: 6,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: '#2C3E7A',
    marginBottom: 6,
    marginTop: 12,
  },
  input: {
    backgroundColor: '#F5F6FA',
    borderRadius: 8,
    padding: 12,
    fontSize: 15,
    color: '#2D3436',
    borderWidth: 1,
    borderColor: '#E0E0E0',
  },
  inputDisabled: {
    backgroundColor: '#ECECEC',
    color: '#888',
  },
  selectorContainer: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 8,
  },
  selectorButton: {
    flex: 1,
    paddingVertical: 10,
    alignItems: 'center',
    borderRadius: 8,
    backgroundColor: '#F5F6FA',
    borderWidth: 1,
    borderColor: '#E0E0E0',
  },
  selectorActive: {
    backgroundColor: '#2C3E7A',
    borderColor: '#2C3E7A',
  },
  selectorText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#666',
  },
  selectorTextActive: {
    color: '#fff',
  },
  button: {
    backgroundColor: '#2C3E7A',
    borderRadius: 8,
    padding: 14,
    alignItems: 'center',
    marginTop: 24,
  },
  buttonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
  },
  errorText: {
    color: '#E74C3C',
    fontSize: 13,
    marginBottom: 8,
    textAlign: 'center',
    backgroundColor: '#FDECEA',
    padding: 10,
    borderRadius: 8,
  },
  successText: {
    color: '#27AE60',
    fontSize: 13,
    marginBottom: 8,
    textAlign: 'center',
    backgroundColor: '#EAFAF1',
    padding: 10,
    borderRadius: 8,
  },
  link: {
    color: '#4A90D9',
    fontSize: 14,
    textAlign: 'center',
    marginTop: 16,
  },
  overlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.5)',
    zIndex: 10,
  },
});