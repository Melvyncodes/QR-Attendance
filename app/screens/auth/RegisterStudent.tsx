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
  useWindowDimensions,
  View
} from 'react-native';
import { auth, db } from '../../../firebase';

const LEVEL_OPTIONS = ['100', '200', '300', '400', '500'];

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

export default function RegisterStudent() {
  const { width } = useWindowDimensions();
  const isLarge = width >= 768;

  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [gender, setGender] = useState('');
  const [matricNumber, setMatricNumber] = useState('');
  const [email, setEmail] = useState('');
  const [department, setDepartment] = useState('');
  const [college, setCollege] = useState('');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [level, setLevel] = useState('');
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
    if (!firstName || !lastName || !gender || !matricNumber || !email ||
      !department || !college || !phoneNumber || !level ||
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

      const cleanMatric = matricNumber.toUpperCase().trim();
      const cleanDept = department.trim();
      const cleanCollege = college.trim();

      await setDoc(doc(db, 'users', user.uid), {
        firstName,
        lastName,
        gender,
        matricNumber: cleanMatric,
        email,
        department: cleanDept,
        college: cleanCollege,
        phoneNumber,
        level,
        role: 'student',
        nfcCardId: null,
        profilePhoto: null,
        createdAt: new Date().toISOString(),
      });

      await setDoc(doc(db, 'matric_lookup', cleanMatric), {
        email,
        uid: user.uid,
      });

      router.replace('/screens/student/Dashboard' as any);

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

  const formContent = (
    <View style={[styles.form, isLarge && styles.formLarge]}>
      {error ? <Text style={styles.error}>{error}</Text> : null}

      <Text style={styles.sectionTitle}>Personal Information</Text>

      <InputField label="First Name" value={firstName} onChangeText={setFirstName} placeholder="Enter your first name" />
      <InputField label="Last Name" value={lastName} onChangeText={setLastName} placeholder="Enter your last name" />

      <Text style={styles.label}>Gender</Text>
      <View style={styles.pillRow}>
        {['Male', 'Female'].map((g) => (
          <TouchableOpacity
            key={g}
            style={[styles.pillBtn, gender === g && styles.pillActive]}
            onPress={() => setGender(g)}
          >
            <Text style={[styles.pillText, gender === g && styles.pillTextActive]}>{g}</Text>
          </TouchableOpacity>
        ))}
      </View>

      <InputField label="Phone Number" value={phoneNumber} onChangeText={setPhoneNumber} placeholder="Enter your phone number" keyboardType="phone-pad" autoCapitalize="none" />

      <Text style={styles.sectionTitle}>Academic Information</Text>

      <InputField
        label="Matric Number"
        value={matricNumber.toUpperCase()}
        onChangeText={(text: string) => setMatricNumber(text.toUpperCase())}
        placeholder="Enter your matric number"
        autoCapitalize="characters"
      />

      <Text style={styles.label}>Level</Text>
      <View style={styles.pillRow}>
        {LEVEL_OPTIONS.map((l) => (
          <TouchableOpacity
            key={l}
            style={[styles.pillBtn, level === l && styles.pillActive]}
            onPress={() => setLevel(l)}
          >
            <Text style={[styles.pillText, level === l && styles.pillTextActive]}>{l}</Text>
          </TouchableOpacity>
        ))}
      </View>

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

      <Text style={styles.sectionTitle}>Account Information</Text>

      <InputField label="Email Address" value={email} onChangeText={setEmail} placeholder="Enter your email" keyboardType="email-address" autoCapitalize="none" />
      <InputField label="Password" value={password} onChangeText={setPassword} placeholder="Minimum 6 characters" secureTextEntry autoCapitalize="none" />
      <InputField label="Confirm Password" value={confirmPassword} onChangeText={setConfirmPassword} placeholder="Re-enter your password" secureTextEntry autoCapitalize="none" />

      <TouchableOpacity style={styles.button} onPress={handleRegister} disabled={loading}>
        {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>Create Account</Text>}
      </TouchableOpacity>

      <TouchableOpacity onPress={() => router.back()}>
        <Text style={styles.link}>Already have an account? Sign In</Text>
      </TouchableOpacity>
    </View>
  );

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.container}>
      <ScrollView
        contentContainerStyle={[styles.scrollContent, isLarge && styles.scrollContentLarge]}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.header}>
          <Text style={styles.title}>Student Registration</Text>
          <Text style={styles.subtitle}>Create your student account</Text>
        </View>
        {formContent}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const PRIMARY = '#2C3E7A';

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F5F6FA',
  },
  scrollContent: {
    paddingHorizontal: 24,
    paddingVertical: 40,
  },
  scrollContentLarge: {
    alignItems: 'center',
    paddingVertical: 40,
  },
  header: {
    alignItems: 'center',
    marginBottom: 24,
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: PRIMARY,
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
    width: '100%',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 4,
  },
  formLarge: {
    maxWidth: 520,
    paddingHorizontal: 36,
    paddingVertical: 30,
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: PRIMARY,
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
    color: PRIMARY,
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
  // Shared pill style for both Gender and Level
  pillRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 8,
  },
  pillBtn: {
    flex: 1,
    paddingVertical: 10,
    alignItems: 'center',
    borderRadius: 8,
    backgroundColor: '#F5F6FA',
    borderWidth: 1,
    borderColor: '#E0E0E0',
  },
  pillActive: {
    backgroundColor: PRIMARY,
    borderColor: PRIMARY,
  },
  pillText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#666',
  },
  pillTextActive: {
    color: '#fff',
  },
  button: {
    backgroundColor: PRIMARY,
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
