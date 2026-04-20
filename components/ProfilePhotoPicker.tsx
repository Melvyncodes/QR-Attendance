import { Ionicons } from '@expo/vector-icons';
import * as ImageManipulator from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';
import { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Dimensions,
  Image,
  Modal,
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';

interface ProfilePhotoPickerProps {
  currentPhoto: string | null;
  avatarLetter: string;
  editing: boolean;
  onPhotoUploaded: (base64: string) => Promise<void>;
  onPhotoRemoved: () => Promise<void>;
}

export default function ProfilePhotoPicker({
  currentPhoto,
  avatarLetter,
  editing,
  onPhotoUploaded,
  onPhotoRemoved,
}: ProfilePhotoPickerProps) {
  const [uploading, setUploading] = useState(false);
  const [previewUri, setPreviewUri] = useState<string | null>(null);
  const [previewVisible, setPreviewVisible] = useState(false);
  const [scale, setScale] = useState(1);
  const [lastDistance, setLastDistance] = useState(0);

  const hasPhoto = !!currentPhoto;

  const pickImage = async () => {
    try {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== 'granted') {
        if (Platform.OS === 'web') window.alert('Permission to access gallery is required.');
        else Alert.alert('Permission Required', 'Please allow access to your photo library.');
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.8,
      });

      if (!result.canceled && result.assets[0]) {
        setPreviewUri(result.assets[0].uri);
        setScale(1);
        setPreviewVisible(true);
      }
    } catch (err) {
      console.error('Image picker error:', err);
    }
  };

  const getDistance = (touches: any[]) => {
    const dx = touches[0].pageX - touches[1].pageX;
    const dy = touches[0].pageY - touches[1].pageY;
    return Math.sqrt(dx * dx + dy * dy);
  };

  const handleTouchMove = (e: any) => {
    if (e.nativeEvent.touches.length === 2) {
      const distance = getDistance(e.nativeEvent.touches);
      if (lastDistance > 0) {
        const newScale = scale * (distance / lastDistance);
        setScale(Math.min(Math.max(newScale, 0.5), 3));
      }
      setLastDistance(distance);
    }
  };

  const handleTouchEnd = () => {
    setLastDistance(0);
  };

  const confirmUpload = async () => {
    if (!previewUri) return;
    setUploading(true);
    setPreviewVisible(false);

    try {
      // Calculate crop based on scale
      // If scale > 1, we crop into the center more (zoom in)
      // If scale < 1, we use more of the image
      const cropFraction = 1 / scale;
      const imageInfo = await ImageManipulator.manipulateAsync(previewUri, [], {});
      const imgW = imageInfo.width;
      const imgH = imageInfo.height;
      const minDim = Math.min(imgW, imgH);
      const cropSize = Math.round(minDim * cropFraction);
      const originX = Math.round((imgW - cropSize) / 2);
      const originY = Math.round((imgH - cropSize) / 2);

      const actions: ImageManipulator.Action[] = [];

      // Only crop if scale is not 1
      if (Math.abs(scale - 1) > 0.05) {
        actions.push({
          crop: {
            originX: Math.max(0, originX),
            originY: Math.max(0, originY),
            width: Math.min(cropSize, imgW),
            height: Math.min(cropSize, imgH),
          },
        });
      }

      // Always resize to 300px for Firestore
      actions.push({ resize: { width: 300 } });

      const manipulated = await ImageManipulator.manipulateAsync(
        previewUri,
        actions,
        { compress: 0.6, format: ImageManipulator.SaveFormat.JPEG, base64: true }
      );

      if (manipulated.base64) {
        const base64String = `data:image/jpeg;base64,${manipulated.base64}`;
        await onPhotoUploaded(base64String);
      }
    } catch (err) {
      console.error('Photo upload error:', err);
      if (Platform.OS === 'web') window.alert('Failed to upload photo.');
      else Alert.alert('Error', 'Failed to upload photo.');
    } finally {
      setUploading(false);
      setPreviewUri(null);
    }
  };

  const cancelPreview = () => {
    setPreviewVisible(false);
    setPreviewUri(null);
    setScale(1);
  };

  const handleRemove = () => {
    if (Platform.OS === 'web') {
      if (window.confirm('Remove your profile photo?')) onPhotoRemoved();
    } else {
      Alert.alert('Remove Photo', 'Remove your profile photo?', [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Remove', style: 'destructive', onPress: onPhotoRemoved },
      ]);
    }
  };

  const screenWidth = Dimensions.get('window').width;
  const previewSize = Math.min(screenWidth * 0.7, 280);

  return (
    <View style={styles.avatarSection}>
      {/* Avatar display */}
      {editing ? (
        <TouchableOpacity onPress={pickImage} disabled={uploading} style={styles.avatarWrapper}>
          {hasPhoto ? (
            <Image source={{ uri: currentPhoto }} style={styles.avatarImg} />
          ) : (
            <View style={styles.avatar}><Text style={styles.avatarLetter}>{avatarLetter}</Text></View>
          )}
          {uploading ? (
            <View style={styles.avatarOverlay}><ActivityIndicator size="small" color="#fff" /></View>
          ) : (
            <View style={styles.cameraIcon}><Ionicons name="camera" size={14} color="#fff" /></View>
          )}
        </TouchableOpacity>
      ) : (
        <View style={styles.avatarWrapper}>
          {hasPhoto ? (
            <Image source={{ uri: currentPhoto }} style={styles.avatarImg} />
          ) : (
            <View style={styles.avatar}><Text style={styles.avatarLetter}>{avatarLetter}</Text></View>
          )}
        </View>
      )}

      {/* Remove button - only in edit mode */}
      {editing && hasPhoto && (
        <TouchableOpacity onPress={handleRemove} style={styles.removePhotoBtn}>
          <Text style={styles.removePhotoText}>Remove Photo</Text>
        </TouchableOpacity>
      )}

      {/* Preview modal with pinch-to-zoom */}
      <Modal visible={previewVisible} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Adjust your photo</Text>
            <Text style={styles.modalHint}>Pinch to resize</Text>

            <View
              style={[styles.previewContainer, { width: previewSize, height: previewSize }]}
              onTouchMove={handleTouchMove}
              onTouchEnd={handleTouchEnd}
            >
              {previewUri && (
                <Image
                  source={{ uri: previewUri }}
                  style={[
                    styles.previewImage,
                    {
                      width: previewSize * scale,
                      height: previewSize * scale,
                    }
                  ]}
                />
              )}
              {/* Circular mask overlay */}
              <View style={[styles.circleMask, { width: previewSize, height: previewSize, borderRadius: previewSize / 2 }]} pointerEvents="none" />
            </View>

            {/* Scale indicator */}
            <Text style={styles.scaleText}>{Math.round(scale * 100)}%</Text>

            {/* Slider for web / fallback */}
            <View style={styles.sliderRow}>
              <TouchableOpacity
                style={styles.sliderBtn}
                onPress={() => setScale(s => Math.max(0.5, s - 0.1))}
              >
                <Ionicons name="remove" size={20} color="#2C3E7A" />
              </TouchableOpacity>
              <View style={styles.sliderTrack}>
                <View style={[styles.sliderFill, { width: `${((scale - 0.5) / 2.5) * 100}%` }]} />
              </View>
              <TouchableOpacity
                style={styles.sliderBtn}
                onPress={() => setScale(s => Math.min(3, s + 0.1))}
              >
                <Ionicons name="add" size={20} color="#2C3E7A" />
              </TouchableOpacity>
            </View>

            <View style={styles.modalActions}>
              <TouchableOpacity style={styles.modalCancel} onPress={cancelPreview}>
                <Text style={styles.modalCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.modalConfirm} onPress={confirmUpload}>
                <Text style={styles.modalConfirmText}>Use Photo</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  avatarSection: { alignItems: 'center', gap: 10 },
  avatarWrapper: { position: 'relative' },
  avatar: { width: 90, height: 90, borderRadius: 45, backgroundColor: '#2C3E7A', justifyContent: 'center', alignItems: 'center' },
  avatarImg: { width: 90, height: 90, borderRadius: 45 },
  avatarLetter: { fontSize: 38, fontWeight: 'bold', color: '#fff' },
  avatarOverlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, borderRadius: 45, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'center', alignItems: 'center' },
  cameraIcon: { position: 'absolute', bottom: 0, right: 0, width: 28, height: 28, borderRadius: 14, backgroundColor: '#2C3E7A', justifyContent: 'center', alignItems: 'center', borderWidth: 2, borderColor: '#F5F6FA' },
  removePhotoBtn: { paddingHorizontal: 12, paddingVertical: 4 },
  removePhotoText: { fontSize: 12, color: '#E74C3C', fontWeight: '600' },

  // Modal
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'center', alignItems: 'center' },
  modalContent: { backgroundColor: '#fff', borderRadius: 20, padding: 24, alignItems: 'center', width: '85%', maxWidth: 360, gap: 12 },
  modalTitle: { fontSize: 18, fontWeight: '700', color: '#2C3E7A' },
  modalHint: { fontSize: 13, color: '#999' },

  previewContainer: { overflow: 'hidden', borderRadius: 999, backgroundColor: '#F0F0F0', justifyContent: 'center', alignItems: 'center' },
  previewImage: { resizeMode: 'cover' },
  circleMask: { position: 'absolute', borderWidth: 3, borderColor: '#2C3E7A', backgroundColor: 'transparent' },

  scaleText: { fontSize: 13, color: '#666', fontWeight: '600' },

  sliderRow: { flexDirection: 'row', alignItems: 'center', gap: 12, width: '100%', paddingHorizontal: 8 },
  sliderBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: '#EEF2FF', justifyContent: 'center', alignItems: 'center' },
  sliderTrack: { flex: 1, height: 6, backgroundColor: '#E0E0E0', borderRadius: 3, overflow: 'hidden' },
  sliderFill: { height: '100%', backgroundColor: '#2C3E7A', borderRadius: 3 },

  modalActions: { flexDirection: 'row', gap: 12, marginTop: 4, width: '100%' },
  modalCancel: { flex: 1, paddingVertical: 12, borderRadius: 10, borderWidth: 1, borderColor: '#E0E0E0', alignItems: 'center' },
  modalCancelText: { color: '#666', fontWeight: '600', fontSize: 14 },
  modalConfirm: { flex: 1, paddingVertical: 12, borderRadius: 10, backgroundColor: '#2C3E7A', alignItems: 'center' },
  modalConfirmText: { color: '#fff', fontWeight: '600', fontSize: 14 },
});
