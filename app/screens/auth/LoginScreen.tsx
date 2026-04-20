import { router } from 'expo-router';
import { signInWithEmailAndPassword } from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';
import React, { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  Image,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  Text, TextInput, TouchableOpacity,
  View
} from 'react-native';
import { auth, db } from '../../../firebase';

const backgrounds = [
  require('../../../assets/images/bg1.jpg'),
  require('../../../assets/images/bg2.jpg'),
  require('../../../assets/images/bg3.jpg'),
  require('../../../assets/images/bg4.jpg'),
  require('../../../assets/images/bg5.jpg'),
];

export default function LoginScreen() {
  const [loginMethod, setLoginMethod] = useState<'matric' | 'email'>('matric');
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [currentBg, setCurrentBg] = useState(0);
  const [nextBg, setNextBg] = useState(1);
  const fadeAnim = useRef(new Animated.Value(1)).current;

  const changeBackground = () => {
    Animated.timing(fadeAnim, {
      toValue: 0,
      duration: 1500,
      useNativeDriver: true,
    }).start(() => {
      setCurrentBg(nextBg);
      setNextBg((prev) => (prev + 1) % backgrounds.length);
      fadeAnim.setValue(1);
    });
  };

  useEffect(() => {
    fadeAnim.setValue(1);
    const interval = setInterval(() => {
      changeBackground();
    }, 2 * 60 * 1000);
    return () => clearInterval(interval);
  }, []);

  const handleLogin = async () => {
    if (!identifier || !password) {
      setError('Please fill in all fields');
      return;
    }
    setLoading(true);
    setError('');

    try {
      let emailToUse = identifier;

      if (loginMethod === 'matric') {
        // Look up email from matric_lookup collection (publicly readable)
        const lookupRef = doc(db, 'matric_lookup', identifier.toUpperCase().trim());
        const lookupSnap = await getDoc(lookupRef);

        if (!lookupSnap.exists()) {
          setError('Matric number not found');
          setLoading(false);
          return;
        }

        emailToUse = lookupSnap.data().email;
      }

      const userCredential = await signInWithEmailAndPassword(auth, emailToUse, password);
      const user = userCredential.user;

      const docRef = doc(db, 'users', user.uid);
      const docSnap = await getDoc(docRef);

      if (docSnap.exists()) {
        const role = docSnap.data().role;
        if (role === 'admin') router.replace('/screens/admin/Dashboard' as any);
        else if (role === 'lecturer') router.replace('/screens/lecturer/Dashboard' as any);
        else if (role === 'student') router.replace('/screens/student/Dashboard' as any);
      }
    } catch (err: any) {
      console.log('Login error:', err);
      if (err?.code === 'auth/wrong-password' || err?.code === 'auth/invalid-credential') {
        setError('Wrong password. Please try again.');
      } else if (err?.code === 'auth/user-not-found') {
        setError('No account found with that email.');
      } else if (err?.code === 'auth/invalid-email') {
        setError('Invalid email format in lookup. Contact admin.');
      } else if (err?.code === 'auth/too-many-requests') {
        setError('Too many attempts. Try again in a few minutes.');
      } else if (err?.code === 'permission-denied') {
        setError('Permission denied. Check Firestore rules.');
      } else {
        setError(`Login failed: ${err?.code || err?.message || 'unknown error'}`);
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.container}>

      {/* Next image always underneath */}
      <Image
        source={backgrounds[nextBg]}
        style={styles.backgroundImage}
        resizeMode="cover"
      />

      {/* Current image fades out on top */}
      <Animated.Image
        source={backgrounds[currentBg]}
        style={[styles.backgroundImage, { opacity: fadeAnim }]}
        resizeMode="cover"
      />

      {/* Dark overlay — always visible, no fade */}
      <View style={styles.overlay} />

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.keyboardView}
      >
        <View style={styles.inner}>

          {/* Header */}
          <View style={styles.header}>
            <Image
              source={require('../../../assets/images/logo-login.png')}
              style={{ width: 220, height: 80, resizeMode: 'contain', marginBottom: 8 }}
            />
            <Text style={styles.subtitle}>Sign in to continue</Text>
          </View>

          {/* Form */}
          <View style={styles.form}>
            {error ? <Text style={styles.error}>{error}</Text> : null}

            {/* Toggle */}
            <View style={styles.toggleContainer}>
              <TouchableOpacity
                style={[styles.toggleButton, loginMethod === 'matric' && styles.toggleActive]}
                onPress={() => { setLoginMethod('matric'); setIdentifier(''); setError(''); }}
              >
                <Text style={[styles.toggleText, loginMethod === 'matric' && styles.toggleTextActive]}>
                  Matric Number
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.toggleButton, loginMethod === 'email' && styles.toggleActive]}
                onPress={() => { setLoginMethod('email'); setIdentifier(''); setError(''); }}
              >
                <Text style={[styles.toggleText, loginMethod === 'email' && styles.toggleTextActive]}>
                  Email
                </Text>
              </TouchableOpacity>
            </View>

            <Text style={styles.label}>
              {loginMethod === 'matric' ? 'Matric Number' : 'Email Address'}
            </Text>
            <TextInput
              style={styles.input}
              placeholder={loginMethod === 'matric' ? 'Enter your matric number' : 'Enter your email'}
              placeholderTextColor="#999"
              value={identifier}
              onChangeText={(text) => setIdentifier(loginMethod === 'matric' ? text.toUpperCase() : text)}
              keyboardType={loginMethod === 'email' ? 'email-address' : 'default'}
              autoCapitalize={loginMethod === 'matric' ? 'characters' : 'none'}
            />

            <Text style={styles.label}>Password</Text>
            <TextInput
              style={styles.input}
              placeholder="Enter your password"
              placeholderTextColor="#999"
              value={password}
              onChangeText={setPassword}
              secureTextEntry
            />

            <TouchableOpacity style={styles.button} onPress={handleLogin}>
              {loading
                ? <ActivityIndicator color="#fff" />
                : <Text style={styles.buttonText}>Sign In</Text>
              }
            </TouchableOpacity>

            <TouchableOpacity onPress={() => router.push('/screens/auth/RegisterStudent' as any)}>
              <Text style={styles.link}>Student? Create an account</Text>
            </TouchableOpacity>

            <TouchableOpacity onPress={() => router.push('/screens/auth/RegisterLecturer' as any)}>
              <Text style={styles.link}>Lecturer? Create an account</Text>
            </TouchableOpacity>

          </View>
        </View>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  backgroundImage: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    width: '100%',
    height: '100%',
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(44, 62, 122, 0.65)',
  },
  keyboardView: {
    flex: 1,
  },
  inner: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  header: {
    alignItems: 'center',
    marginBottom: 40,
  },
  title: {
    fontSize: 36,
    fontWeight: 'bold',
    color: '#FFFFFF',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
    color: 'rgba(255,255,255,0.8)',
  },
  form: {
    backgroundColor: 'rgba(255,255,255,0.95)',
    borderRadius: 16,
    padding: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 8,
  },
  toggleContainer: {
    flexDirection: 'row',
    backgroundColor: '#F5F6FA',
    borderRadius: 8,
    padding: 4,
    marginBottom: 16,
  },
  toggleButton: {
    flex: 1,
    paddingVertical: 8,
    alignItems: 'center',
    borderRadius: 6,
  },
  toggleActive: {
    backgroundColor: '#2C3E7A',
  },
  toggleText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#666',
  },
  toggleTextActive: {
    color: '#fff',
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
  },
  link: {
    color: '#4A90D9',
    fontSize: 14,
    textAlign: 'center',
    marginTop: 16,
  },
});