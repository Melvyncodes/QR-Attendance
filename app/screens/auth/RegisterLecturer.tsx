import AutocompleteInput from '@/components/AutocompleteInput';
import { BOWEN_COLLEGES, COMMON_BOWEN_PROGRAMS } from '@/constants/bowenConstants';
import { router } from 'expo-router';
import { createUserWithEmailAndPassword } from 'firebase/auth';
import { collection, doc, getDocs, setDoc } from 'firebase/firestore';
import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View
} from 'react-native';
import { auth, db } from '../../../firebase';

const InputField = ({
  label, value, onChangeText, placeholder, keyboardType, secureTextEntry, autoCapitalize
}: any) => (
  <View>
    <Text style={styles.label}>{label}</Text>
    <TextInput
      style={styles.input}
      value={value}
      onChangeText={onChangeText}
      placeholder={placeholder}
      placeholderTextColor="#999"
      keyboardType={keyboardType || 'default'}
      secureTextEntry={secureTextEntry || false}
      autoCapitalize={autoCapitalize || 'words'}
    />
  </View>
);

export default function RegisterLecturer() {
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [gender, setGender] = useState('');
  const [staffId, setStaffId] = useState('');
  const [email, setEmail] = useState('');
  const [department, setDepartment] = useState('');
  const [college, setCollege] = useState('');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [livePrograms, setLivePrograms] = useState<string[]>([]);

  useEffect(() => {
    const fetchPrograms = async () => {
      try {
        const set = new Set<string>();
        const [usersSnap, coursesSnap] = await Promise.all([
          getDocs(collection(db, 'users')),
          getDocs(collection(db, 'courses')),
        ]);
        usersSnap.docs.forEach(d => {
          const dept = d.data().department;
          if (dept && typeof dept === 'string') set.add(dept.trim());
        });
        coursesSnap.docs.forEach(d => {
          const dept = d.data().department;
          if (dept && typeof dept === 'string') set.add(dept.trim());
        });
        setLivePrograms(Array.from(set));
      } catch (err) {
        console.error('Failed to fetch programs', err);
      }
    };
    fetchPrograms();
  }, []);

  const programSuggestions = Array.from(new Set([...COMMON_BOWEN_PROGRAMS, ...livePrograms])).sort();

  const handleRegister = async () => {
    if (!firstName || !lastName || !gender || !staffId || !email ||
      !department || !college || !phoneNumber ||
      !password || !confirmPassword) {
      setError('Please fill in all fields');
      return;
    }
    if (password !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }
    if (password.length < 6) {
      setError('Password must be at least 6 characters');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const userCredential = await createUserWithEmailAndPassword(auth, email, password);
      const user = userCredential.user;

      await setDoc(doc(db, 'users', user.uid), {
        firstName,
        lastName,
        title: gender,
        staffId,
        email,
        department: department.trim(),
        college: college.trim(),
        phoneNumber,
        role: 'lecturer',
        profilePhoto: null,
        createdAt: new Date().toISOString(),
      });

      router.replace('/screens/lecturer/Dashboard' as any);

    } catch (err: any) {
      if (err.code === 'auth/email-already-in-use') {
        setError('Email already registered');
      } else if (err.code === 'auth/invalid-email') {
        setError('Invalid email address');
      } else {
        setError('Registration failed. Please try again.');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      style={styles.container}
    >
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.title}>Lecturer Registration</Text>
          <Text style={styles.subtitle}>Create your lecturer account</Text>
        </View>

        {/* Form */}
        <View style={styles.form}>
          {error ? <Text style={styles.error}>{error}</Text> : null}

          {/* Personal Info */}
          <Text style={styles.sectionTitle}>Personal Information</Text>

          <InputField
            label="First Name"
            value={firstName}
            onChangeText={setFirstName}
            placeholder="Enter your first name"
          />
          <InputField
            label="Last Name"
            value={lastName}
            onChangeText={setLastName}
            placeholder="Enter your last name"
          />

          {/* Title Selector */}
          <Text style={styles.label}>Title</Text>
          <View style={styles.genderContainer}>
            {['Mr', 'Mrs', 'Miss', 'Dr', 'Prof'].map((t) => (
              <TouchableOpacity
                key={t}
                style={[styles.genderButton, gender === t && styles.genderActive]}
                onPress={() => setGender(t)}
              >
                <Text style={[styles.genderText, gender === t && styles.genderTextActive]}>
                  {t}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          <InputField
            label="Phone Number"
            value={phoneNumber}
            onChangeText={setPhoneNumber}
            placeholder="Enter your phone number"
            keyboardType="phone-pad"
            autoCapitalize="none"
          />

          {/* Academic Info */}
          <Text style={styles.sectionTitle}>Academic Information</Text>

          <InputField
            label="Staff ID"
            value={staffId}
            onChangeText={setStaffId}
            placeholder="Enter your staff ID"
            autoCapitalize="none"
          />
          <AutocompleteInput
            label="Department"
            value={department}
            onChangeText={setDepartment}
            placeholder="e.g. Computer Science"
            suggestions={programSuggestions}
            helperText="Start typing to see existing programs"
          />
          <AutocompleteInput
            label="College"
            value={college}
            onChangeText={setCollege}
            placeholder="e.g. COCCS - College of Computing..."
            suggestions={BOWEN_COLLEGES}
            helperText="Pick from Bowen's official colleges"
          />

          {/* Account Info */}
          <Text style={styles.sectionTitle}>Account Information</Text>

          <InputField
            label="Email Address"
            value={email}
            onChangeText={setEmail}
            placeholder="Enter your email"
            keyboardType="email-address"
            autoCapitalize="none"
          />
          <InputField
            label="Password"
            value={password}
            onChangeText={setPassword}
            placeholder="Minimum 6 characters"
            secureTextEntry
            autoCapitalize="none"
          />
          <InputField
            label="Confirm Password"
            value={confirmPassword}
            onChangeText={setConfirmPassword}
            placeholder="Re-enter your password"
            secureTextEntry
            autoCapitalize="none"
          />

          {/* Register Button */}
          <TouchableOpacity
            style={styles.button}
            onPress={handleRegister}
            disabled={loading}
          >
            {loading
              ? <ActivityIndicator color="#fff" />
              : <Text style={styles.buttonText}>Create Account</Text>
            }
          </TouchableOpacity>

          <TouchableOpacity onPress={() => router.back()}>
            <Text style={styles.link}>Already have an account? Sign In</Text>
          </TouchableOpacity>

        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F5F6FA',
  },
  scrollContent: {
    paddingHorizontal: 24,
    paddingVertical: 40,
  },
  header: {
    alignItems: 'center',
    marginBottom: 32,
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#2C3E7A',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 15,
    color: '#666',
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
  genderContainer: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 8,
  },
  genderButton: {
    flex: 1,
    paddingVertical: 10,
    alignItems: 'center',
    borderRadius: 8,
    backgroundColor: '#F5F6FA',
    borderWidth: 1,
    borderColor: '#E0E0E0',
  },
  genderActive: {
    backgroundColor: '#2C3E7A',
    borderColor: '#2C3E7A',
  },
  genderText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#666',
  },
  genderTextActive: {
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
  error: {
    color: '#E74C3C',
    fontSize: 13,
    marginBottom: 8,
    textAlign: 'center',
    backgroundColor: '#FDECEA',
    padding: 10,
    borderRadius: 8,
  },
  link: {
    color: '#4A90D9',
    fontSize: 14,
    textAlign: 'center',
    marginTop: 16,
  },
});