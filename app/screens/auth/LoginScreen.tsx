import { router } from "expo-router";
import { signInWithEmailAndPassword } from "firebase/auth";
import { doc, getDoc } from "firebase/firestore";
import React, { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Animated,
  Image,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from "react-native";
import { auth, db } from "../../../firebase";

const backgrounds = [
  require("../../../assets/images/bg1.jpg"),
  require("../../../assets/images/bg2.jpg"),
  require("../../../assets/images/bg3.jpg"),
  require("../../../assets/images/bg4.jpg"),
  require("../../../assets/images/bg5.jpg"),
];

export default function LoginScreen() {
  const { width } = useWindowDimensions();
  const isWeb = Platform.OS === "web";
  const isLarge = width >= 768; // tablet / desktop breakpoint

  const [loginMethod, setLoginMethod] = useState<"matric" | "email">("matric");
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
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
    const interval = setInterval(
      () => {
        changeBackground();
      },
      2 * 60 * 1000,
    );
    return () => clearInterval(interval);
  }, []);

  const handleLogin = async () => {
    if (!identifier || !password) {
      setError("Please fill in all fields");
      return;
    }
    setLoading(true);
    setError("");

    try {
      let emailToUse = identifier;

      if (loginMethod === "matric") {
        const lookupRef = doc(
          db,
          "matric_lookup",
          identifier.toUpperCase().trim(),
        );
        const lookupSnap = await getDoc(lookupRef);

        if (!lookupSnap.exists()) {
          setError("Matric number not found");
          setLoading(false);
          return;
        }

        emailToUse = lookupSnap.data().email;
      }

      const userCredential = await signInWithEmailAndPassword(
        auth,
        emailToUse,
        password,
      );
      const user = userCredential.user;

      const docRef = doc(db, "users", user.uid);
      const docSnap = await getDoc(docRef);

      if (docSnap.exists()) {
        const role = docSnap.data().role;
        if (role === "admin") router.replace("/screens/admin/Dashboard" as any);
        else if (role === "lecturer")
          router.replace("/screens/lecturer/Dashboard" as any);
        else if (role === "student")
          router.replace("/screens/student/Dashboard" as any);
      }
    } catch (err: any) {
      console.log("Login error:", err);
      if (
        err?.code === "auth/wrong-password" ||
        err?.code === "auth/invalid-credential"
      ) {
        setError("Wrong password. Please try again.");
      } else if (err?.code === "auth/user-not-found") {
        setError("No account found with that email.");
      } else if (err?.code === "auth/invalid-email") {
        setError("Invalid email format in lookup. Contact admin.");
      } else if (err?.code === "auth/too-many-requests") {
        setError("Too many attempts. Try again in a few minutes.");
      } else if (err?.code === "permission-denied") {
        setError("Permission denied. Check Firestore rules.");
      } else {
        setError(
          `Login failed: ${err?.code || err?.message || "unknown error"}`,
        );
      }
    } finally {
      setLoading(false);
    }
  };

  const formCard = (
    <View style={[styles.card, isLarge && styles.cardLarge]}>
      {/* Brand */}
      <View style={styles.brandRow}>
        <View style={styles.brandIconWrap}>
          <Image
            source={require("../../../assets/images/logo-login.png")}
            style={[styles.brandIcon, isLarge && styles.brandIconLarge]}
            resizeMode="contain"
          />
        </View>
      </View>

      {/* Welcome */}
      <Text style={[styles.welcomeTitle, isLarge && styles.welcomeTitleLarge]}>
        Welcome Back
      </Text>
      <Text style={[styles.welcomeSub, isLarge && styles.welcomeSubLarge]}>
        Sign in to your student portal
      </Text>

      {/* Tab switcher */}
      <View style={styles.tabRow}>
        <TouchableOpacity
          style={[
            styles.tabBtn,
            loginMethod === "matric" && styles.tabBtnActive,
          ]}
          onPress={() => {
            setLoginMethod("matric");
            setIdentifier("");
            setError("");
          }}
        >
          <Text
            style={[
              styles.tabText,
              loginMethod === "matric" && styles.tabTextActive,
            ]}
          >
            Matric No.
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[
            styles.tabBtn,
            loginMethod === "email" && styles.tabBtnActive,
          ]}
          onPress={() => {
            setLoginMethod("email");
            setIdentifier("");
            setError("");
          }}
        >
          <Text
            style={[
              styles.tabText,
              loginMethod === "email" && styles.tabTextActive,
            ]}
          >
            Email
          </Text>
        </TouchableOpacity>
      </View>

      {/* Error */}
      {error ? <Text style={styles.error}>{error}</Text> : null}

      {/* Identifier field */}
      <Text style={styles.label}>
        {loginMethod === "matric" ? "Matric Number" : "Email Address"}
      </Text>
      <TextInput
        style={[styles.input, isLarge && styles.inputLarge]}
        placeholder={
          loginMethod === "matric" ? "e.g. BU22CSC1234" : "student@gmail.com"
        }
        placeholderTextColor="#A0AEC0"
        value={identifier}
        onChangeText={(text) =>
          setIdentifier(loginMethod === "matric" ? text.toUpperCase() : text)
        }
        keyboardType={loginMethod === "email" ? "email-address" : "default"}
        autoCapitalize={loginMethod === "matric" ? "characters" : "none"}
      />

      {/* Password field */}
      <Text style={styles.label}>Password</Text>
      <TextInput
        style={[styles.input, isLarge && styles.inputLarge]}
        placeholder="Enter your password"
        placeholderTextColor="#A0AEC0"
        value={password}
        onChangeText={setPassword}
        secureTextEntry
      />

      {/* Sign In button */}
      <TouchableOpacity
        style={[
          styles.signInBtn,
          isLarge && styles.signInBtnLarge,
          loading && { opacity: 0.75 },
        ]}
        onPress={handleLogin}
        disabled={loading}
      >
        {loading ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text style={[styles.signInText, isLarge && styles.signInTextLarge]}>
            Sign In
          </Text>
        )}
      </TouchableOpacity>

      {/* Register links */}
      <View style={styles.divider}>
        <View style={styles.dividerLine} />
        <Text style={styles.dividerText}>New here?</Text>
        <View style={styles.dividerLine} />
      </View>

      {/* On large screens, place register buttons side-by-side */}
      <View style={[styles.registerRow, isLarge && styles.registerRowLarge]}>
        <TouchableOpacity
          style={[styles.registerBtn, isLarge && styles.registerBtnLarge]}
          onPress={() => router.push("/screens/auth/RegisterStudent" as any)}
        >
          <Text
            style={[styles.registerText, isLarge && styles.registerTextLarge]}
          >
            Create Student Account
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.registerBtn, isLarge && styles.registerBtnLarge]}
          onPress={() => router.push("/screens/auth/RegisterLecturer" as any)}
        >
          <Text
            style={[styles.registerText, isLarge && styles.registerTextLarge]}
          >
            Create Lecturer Account
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );

  return (
    <View style={styles.container}>
      {/* Background images */}
      <Image
        source={backgrounds[nextBg]}
        style={styles.backgroundImage}
        resizeMode="cover"
      />
      <Animated.Image
        source={backgrounds[currentBg]}
        style={[styles.backgroundImage, { opacity: fadeAnim }]}
        resizeMode="cover"
      />
      <View style={styles.overlay} />

      {isWeb && isLarge ? (
        /* ── Web / Desktop: centred, max-width card, no keyboard-avoiding ── */
        <ScrollView
          contentContainerStyle={styles.webScrollContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {formCard}
        </ScrollView>
      ) : (
        /* ── Mobile: original keyboard-avoiding behaviour ── */
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : "height"}
          style={styles.keyboardView}
        >
          <ScrollView
            contentContainerStyle={styles.mobileScrollContent}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            {formCard}
          </ScrollView>
        </KeyboardAvoidingView>
      )}
    </View>
  );
}

const PRIMARY = "#2C3E7A";
const PRIMARY_DARK = "#1E2E62";
const NAVY = "#1A2E3B";

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#000",
  },
  backgroundImage: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    width: "100%",
    height: "100%",
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(44, 62, 122, 0.65)",
  },
  keyboardView: {
    flex: 1,
  },

  /* ── Scroll containers ── */
  webScrollContent: {
    flexGrow: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 24,
    paddingHorizontal: 24,
  },
  mobileScrollContent: {
    flexGrow: 1,
    justifyContent: "center",
    paddingHorizontal: 20,
    paddingVertical: 20,
  },

  /* ── Card ── */
  card: {
    backgroundColor: "rgba(255,255,255,0.95)",
    borderRadius: 16,
    paddingHorizontal: 22,
    paddingVertical: 22,
    width: "100%",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 8,
  },
  cardLarge: {
    maxWidth: 460,
    paddingHorizontal: 36,
    paddingVertical: 30,
    borderRadius: 20,
  },

  /* ── Brand ── */
  brandRow: {
    alignItems: "center",
    marginBottom: 10,
  },
  brandIconWrap: {
    width: 100,
    height: 60,
    backgroundColor: "transparent",
    alignItems: "center",
    justifyContent: "center",
  },
  brandIcon: {
    width: 180,
    height: 60,
  },
  brandIconLarge: {
    width: 210,
    height: 70,
  },

  /* ── Welcome ── */
  welcomeTitle: {
    fontSize: 20,
    fontWeight: "700",
    color: NAVY,
    textAlign: "center",
    marginBottom: 2,
  },
  welcomeTitleLarge: {
    fontSize: 24,
  },
  welcomeSub: {
    fontSize: 13,
    color: "#718096",
    textAlign: "center",
    marginBottom: 14,
  },
  welcomeSubLarge: {
    fontSize: 15,
    marginBottom: 18,
  },

  /* ── Tabs ── */
  tabRow: {
    flexDirection: "row",
    backgroundColor: "#F5F6FA",
    borderRadius: 8,
    padding: 3,
    marginBottom: 12,
  },
  tabBtn: {
    flex: 1,
    paddingVertical: 7,
    alignItems: "center",
    borderRadius: 6,
  },
  tabBtnActive: {
    backgroundColor: PRIMARY,
  },
  tabText: {
    fontSize: 13,
    fontWeight: "600",
    color: "#666",
  },
  tabTextActive: {
    color: "#fff",
  },

  /* ── Fields ── */
  labelRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: 8,
    marginBottom: 4,
  },
  label: {
    fontSize: 13,
    fontWeight: "600",
    color: PRIMARY,
    marginTop: 8,
    marginBottom: 4,
  },
  input: {
    backgroundColor: "#F5F6FA",
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    color: "#2D3436",
    borderWidth: 1,
    borderColor: "#E0E0E0",
  },
  inputLarge: {
    paddingVertical: 12,
    fontSize: 15,
  },

  /* ── Sign In button ── */
  signInBtn: {
    backgroundColor: PRIMARY,
    borderRadius: 8,
    paddingVertical: 12,
    alignItems: "center",
    marginTop: 16,
  },
  signInBtnLarge: {
    paddingVertical: 14,
    marginTop: 20,
  },
  signInText: {
    color: "#fff",
    fontSize: 15,
    fontWeight: "bold",
  },
  signInTextLarge: {
    fontSize: 16,
  },

  /* ── Divider ── */
  divider: {
    flexDirection: "row",
    alignItems: "center",
    marginVertical: 12,
    gap: 8,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: "#E2E8F0",
  },
  dividerText: {
    fontSize: 12,
    color: "#A0AEC0",
    fontWeight: "500",
  },

  /* ── Register buttons ── */
  registerRow: {
    flexDirection: "column",
    gap: 8,
  },
  registerRowLarge: {
    flexDirection: "row",
    gap: 10,
  },
  registerBtn: {
    borderWidth: 1.5,
    borderColor: "#CBD5E0",
    borderRadius: 8,
    paddingVertical: 10,
    alignItems: "center",
  },
  registerBtnLarge: {
    flex: 1,
    paddingVertical: 11,
  },
  registerText: {
    fontSize: 13,
    fontWeight: "600",
    color: "#4A90D9",
  },
  registerTextLarge: {
    fontSize: 14,
  },

  /* ── Error ── */
  error: {
    color: "#E74C3C",
    fontSize: 12,
    textAlign: "center",
    marginBottom: 6,
    backgroundColor: "#FFF5F5",
    borderRadius: 8,
    paddingVertical: 6,
    paddingHorizontal: 10,
  },
});
