import ProfilePhotoPicker from "@/components/ProfilePhotoPicker";
import Sidebar from "@/components/Sidebar";
import { useUser } from "@/context/UserContext";
import { useResponsive } from "@/hooks/useResponsive";
import { Ionicons } from "@expo/vector-icons";
import { doc, updateDoc } from "firebase/firestore";
import { useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { db } from "../../../firebase";

const EditField = ({
  label,
  value,
  onChange,
  placeholder,
  keyboardType,
  editable = true,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  keyboardType?: any;
  editable?: boolean;
}) => (
  <View style={styles.editField}>
    <Text style={styles.editLabel}>{label}</Text>
    <TextInput
      style={[styles.editInput, !editable && styles.editInputDisabled]}
      value={value}
      onChangeText={onChange}
      placeholder={placeholder}
      placeholderTextColor="#999"
      editable={editable}
      keyboardType={keyboardType || "default"}
      autoCorrect={false}
      autoCapitalize="words"
    />
  </View>
);

const InfoRow = ({ label, value }: { label: string; value: string }) => (
  <View style={styles.infoRow}>
    <Text style={styles.infoLabel}>{label}</Text>
    <Text style={styles.infoValue}>{value || "Not set"}</Text>
  </View>
);

export default function LecturerProfile() {
  const { userData, setUserData } = useUser();
  const { isWeb } = useResponsive();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);

  const [firstName, setFirstName] = useState(userData?.firstName || "");
  const [lastName, setLastName] = useState(userData?.lastName || "");
  const [phoneNumber, setPhoneNumber] = useState(userData?.phoneNumber || "");
  const [department, setDepartment] = useState(userData?.department || "");
  const [college, setCollege] = useState(userData?.college || "");

  const roleLabel =
    (userData?.role || "lecturer").charAt(0).toUpperCase() +
    (userData?.role || "lecturer").slice(1);
  const roleBadgeLabel = (userData?.role || "LECTURER").toUpperCase();

  const handlePhotoUploaded = async (base64: string) => {
    await updateDoc(doc(db, "users", userData?.uid), { profilePhoto: base64 });
    if (setUserData)
      setUserData((prev: any) => ({ ...prev, profilePhoto: base64 }));
  };

  const handlePhotoRemoved = async () => {
    await updateDoc(doc(db, "users", userData?.uid), { profilePhoto: "" });
    if (setUserData)
      setUserData((prev: any) => ({ ...prev, profilePhoto: "" }));
  };

  const handleSave = async () => {
    if (!firstName.trim() || !lastName.trim()) {
      if (Platform.OS === "web")
        window.alert("First name and last name are required.");
      else Alert.alert("Error", "First name and last name are required.");
      return;
    }
    setSaving(true);
    try {
      const updates = {
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        phoneNumber: phoneNumber.trim(),
        department: department.trim(),
        college: college.trim(),
      };
      await updateDoc(doc(db, "users", userData?.uid), updates);
      if (setUserData) setUserData((prev: any) => ({ ...prev, ...updates }));
      setEditing(false);
      if (Platform.OS === "web") window.alert("Profile updated successfully!");
      else Alert.alert("Success", "Profile updated successfully!");
    } catch (err) {
      console.error(err);
      if (Platform.OS === "web") window.alert("Failed to update profile.");
      else Alert.alert("Error", "Failed to update profile.");
    } finally {
      setSaving(false);
    }
  };

  const handleCancel = () => {
    setFirstName(userData?.firstName || "");
    setLastName(userData?.lastName || "");
    setPhoneNumber(userData?.phoneNumber || "");
    setDepartment(userData?.department || "");
    setCollege(userData?.college || "");
    setEditing(false);
  };

  const avatarLetter = (userData?.firstName?.[0] || "L").toUpperCase();
  const fullName =
    `${userData?.title || ""} ${userData?.firstName || ""} ${userData?.lastName || ""}`.trim();

  return (
    <View style={styles.container}>
      {(isWeb || sidebarOpen) && (
        <Sidebar
          role="lecturer"
          userName={
            userData
              ? `${userData.title || ""} ${userData.firstName} ${userData.lastName}`.trim()
              : "..."
          }
          activeRoute="/screens/lecturer/Profile"
        />
      )}
      <View style={styles.content}>
        <View style={[styles.topBar, { paddingTop: isWeb ? 22 : 50 }]}>
          {!isWeb && (
            <TouchableOpacity
              style={styles.menuButton}
              onPress={() => setSidebarOpen(!sidebarOpen)}
            >
              <Ionicons
                name={sidebarOpen ? "close" : "menu"}
                size={24}
                color="#2C3E7A"
              />
            </TouchableOpacity>
          )}
          <Text style={[styles.headerTitle, { fontSize: isWeb ? 18 : 15 }]}>
            My Profile
          </Text>
          {!editing && (
            <TouchableOpacity
              style={styles.editButton}
              onPress={() => setEditing(true)}
            >
              <Ionicons name="pencil-outline" size={16} color="#fff" />
              <Text style={styles.editButtonText}>Edit</Text>
            </TouchableOpacity>
          )}
        </View>

        <ScrollView
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.profileContainer}>
            <View style={styles.avatarArea}>
              <ProfilePhotoPicker
                currentPhoto={userData?.profilePhoto}
                avatarLetter={avatarLetter}
                editing={editing}
                onPhotoUploaded={handlePhotoUploaded}
                onPhotoRemoved={handlePhotoRemoved}
              />
              <Text style={styles.avatarName}>{fullName}</Text>
              <View style={styles.roleBadge}>
                <Text style={styles.roleBadgeText}>{roleBadgeLabel}</Text>
              </View>
            </View>

            {editing ? (
              <View style={styles.card}>
                <Text style={styles.cardTitle}>Edit Profile</Text>
                <EditField
                  label="First Name *"
                  value={firstName}
                  onChange={setFirstName}
                  placeholder="Enter first name"
                />
                <EditField
                  label="Last Name *"
                  value={lastName}
                  onChange={setLastName}
                  placeholder="Enter last name"
                />
                <EditField
                  label="Phone Number"
                  value={phoneNumber}
                  onChange={setPhoneNumber}
                  placeholder="Enter phone number"
                  keyboardType="phone-pad"
                />
                <EditField
                  label="Department"
                  value={department}
                  onChange={setDepartment}
                  placeholder="Enter department"
                />
                <EditField
                  label="College"
                  value={college}
                  onChange={setCollege}
                  placeholder="Enter college"
                />
                <EditField
                  label="Title (cannot be changed)"
                  value={userData?.title || ""}
                  onChange={() => {}}
                  editable={false}
                />
                <EditField
                  label="Staff ID (cannot be changed)"
                  value={userData?.staffId || ""}
                  onChange={() => {}}
                  editable={false}
                />
                <EditField
                  label="Email (cannot be changed)"
                  value={userData?.email || ""}
                  onChange={() => {}}
                  editable={false}
                />
                <View style={styles.editActions}>
                  <TouchableOpacity
                    style={styles.cancelButton}
                    onPress={handleCancel}
                  >
                    <Text style={styles.cancelButtonText}>Cancel</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.saveButton}
                    onPress={handleSave}
                    disabled={saving}
                  >
                    {saving ? (
                      <ActivityIndicator size="small" color="#fff" />
                    ) : (
                      <Text style={styles.saveButtonText}>Save Changes</Text>
                    )}
                  </TouchableOpacity>
                </View>
              </View>
            ) : (
              <>
                <View style={styles.card}>
                  <Text style={styles.cardTitle}>Personal Information</Text>
                  <InfoRow label="Title" value={userData?.title} />
                  <InfoRow label="First Name" value={userData?.firstName} />
                  <InfoRow label="Last Name" value={userData?.lastName} />
                  <InfoRow label="Phone Number" value={userData?.phoneNumber} />
                </View>
                <View style={styles.card}>
                  <Text style={styles.cardTitle}>Academic Information</Text>
                  <InfoRow label="Staff ID" value={userData?.staffId} />
                  <InfoRow label="Department" value={userData?.department} />
                  <InfoRow label="College" value={userData?.college} />
                </View>
                <View style={styles.card}>
                  <Text style={styles.cardTitle}>Account</Text>
                  <InfoRow label="Email" value={userData?.email} />
                  <InfoRow label="Role" value={roleLabel} />
                </View>
              </>
            )}
          </View>
        </ScrollView>
      </View>
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
  container: { flex: 1, flexDirection: "row", backgroundColor: "#F5F6FA" },
  content: { flex: 1, overflow: "hidden", minWidth: 0 },
  topBar: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#fff",
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#E0E0E0",
    gap: 12,
    minHeight: 64,
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
  editButton: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#2C3E7A",
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 8,
    gap: 6,
  },
  editButtonText: { color: "#fff", fontWeight: "600", fontSize: 13 },
  profileContainer: { padding: 16, gap: 16 },
  avatarArea: { alignItems: "center", paddingVertical: 24, gap: 10 },
  avatarName: { fontSize: 20, fontWeight: "bold", color: "#2D3436" },
  roleBadge: {
    backgroundColor: "#EEF2FF",
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 12,
  },
  roleBadgeText: { color: "#2C3E7A", fontSize: 12, fontWeight: "700" },
  card: {
    backgroundColor: "#fff",
    borderRadius: 16,
    padding: 20,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 2,
    gap: 4,
  },
  cardTitle: {
    fontSize: 14,
    fontWeight: "700",
    color: "#2C3E7A",
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginBottom: 8,
    paddingBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: "#F0F0F0",
  },
  infoRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: "#F5F6FA",
  },
  infoLabel: { fontSize: 13, color: "#666", flex: 1 },
  infoValue: {
    fontSize: 13,
    fontWeight: "600",
    color: "#2D3436",
    flex: 2,
    textAlign: "right",
  },
  editField: { gap: 6, marginBottom: 12 },
  editLabel: { fontSize: 13, fontWeight: "600", color: "#2C3E7A" },
  editInput: {
    backgroundColor: "#F5F6FA",
    borderRadius: 8,
    padding: 12,
    fontSize: 14,
    color: "#2D3436",
    borderWidth: 1,
    borderColor: "#E0E0E0",
  },
  editInputDisabled: { backgroundColor: "#ECECEC", color: "#888" },
  editActions: { flexDirection: "row", gap: 12, marginTop: 8 },
  cancelButton: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#E0E0E0",
    alignItems: "center",
  },
  cancelButtonText: { color: "#666", fontWeight: "600", fontSize: 14 },
  saveButton: {
    flex: 2,
    paddingVertical: 12,
    borderRadius: 8,
    backgroundColor: "#2C3E7A",
    alignItems: "center",
  },
  saveButtonText: { color: "#fff", fontWeight: "600", fontSize: 14 },
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
