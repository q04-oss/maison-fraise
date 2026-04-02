import React, { useState, useEffect } from 'react';
import {
  View, Text, TouchableOpacity, TextInput,
  StyleSheet, Image, Alert,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { usePanel } from '../../context/PanelContext';
import { uploadToCloudinary, uploadPortalContent } from '../../lib/api';
import { useColors, fonts, SPACING } from '../../theme';

function BlinkingCursor() {
  const [visible, setVisible] = useState(true);
  useEffect(() => {
    const id = setInterval(() => setVisible(v => !v), 500);
    return () => clearInterval(id);
  }, []);
  return <Text style={{ opacity: visible ? 1 : 0 }}>_</Text>;
}

export default function PortalUploadPanel() {
  const { goBack } = usePanel();
  const c = useColors();

  const [mediaBase64, setMediaBase64] = useState<string | null>(null);
  const [mediaUri, setMediaUri] = useState<string | null>(null);
  const [mediaType, setMediaType] = useState<'image' | 'video'>('image');
  const [caption, setCaption] = useState('');
  const [uploading, setUploading] = useState(false);
  const [success, setSuccess] = useState(false);

  const pickFromLibrary = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.All,
      base64: true,
      quality: 0.7,
    });
    if (!result.canceled && result.assets.length > 0) {
      const asset = result.assets[0];
      setMediaBase64(asset.base64 ?? null);
      setMediaUri(asset.uri);
      setMediaType(asset.type === 'video' ? 'video' : 'image');
    }
  };

  const takePhoto = async () => {
    const result = await ImagePicker.launchCameraAsync({
      base64: true,
      quality: 0.7,
    });
    if (!result.canceled && result.assets.length > 0) {
      const asset = result.assets[0];
      setMediaBase64(asset.base64 ?? null);
      setMediaUri(asset.uri);
      setMediaType('image');
    }
  };

  const handleUpload = async () => {
    if (!mediaBase64 || uploading) return;
    setUploading(true);
    try {
      const url = await uploadToCloudinary(mediaBase64, mediaType);
      await uploadPortalContent(url, mediaType === 'image' ? 'photo' : 'video', caption.trim() || undefined);
      setSuccess(true);
      setTimeout(() => goBack(), 1500);
    } catch (e: any) {
      Alert.alert('ERR: upload failed', e.message ?? 'Please try again.');
    } finally {
      setUploading(false);
    }
  };

  return (
    <View style={[styles.container, { backgroundColor: c.panelBg }]}>
      <View style={[styles.header, { borderBottomColor: c.border }]}>
        <TouchableOpacity onPress={goBack} style={styles.backBtn} activeOpacity={0.7}>
          <Text style={[styles.backBtnText, { color: c.accent }]}>←</Text>
        </TouchableOpacity>
        <View style={styles.headerTitleRow}>
          <Text style={[styles.headerPrompt, { color: c.accent }]}>{'> '}</Text>
          <Text style={[styles.headerTitle, { color: c.text }]}>{'upload content'}</Text>
        </View>
        <View style={styles.headerSpacer} />
      </View>

      <View style={styles.body}>
        <Text style={[styles.separator, { color: c.border }]}>{'────────────────────────────────'}</Text>

        {success ? (
          <View style={styles.statusRow}>
            <Text style={[styles.statusText, { color: '#4CAF50' }]}>{'OK: uploaded'}</Text>
            <BlinkingCursor />
          </View>
        ) : uploading ? (
          <View style={styles.statusRow}>
            <Text style={[styles.statusText, { color: c.accent }]}>{'> uploading'}</Text>
            <BlinkingCursor />
          </View>
        ) : (
          <>
            <TouchableOpacity style={styles.actionLine} onPress={pickFromLibrary} activeOpacity={0.7}>
              <Text style={[styles.actionText, { color: c.accent }]}>{'> SELECT FROM LIBRARY_'}</Text>
              <Text style={[styles.hint, { color: c.muted }]}>{'  (photo or video)'}</Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.actionLine} onPress={takePhoto} activeOpacity={0.7}>
              <Text style={[styles.actionText, { color: c.accent }]}>{'> TAKE PHOTO_'}</Text>
            </TouchableOpacity>

            {mediaUri ? (
              <View style={styles.previewContainer}>
                <Image
                  source={{ uri: mediaUri }}
                  style={styles.preview}
                  resizeMode="cover"
                />
                {mediaType === 'video' && (
                  <View style={styles.videoOverlay}>
                    <Text style={styles.videoIcon}>▶</Text>
                  </View>
                )}
              </View>
            ) : null}

            <Text style={[styles.separator, { color: c.border }]}>{'────────────────────────────────'}</Text>

            <TextInput
              style={[styles.captionInput, { borderColor: c.border, color: c.text, backgroundColor: c.card }]}
              value={caption}
              onChangeText={setCaption}
              placeholder="caption (optional)"
              placeholderTextColor={c.muted}
              multiline
              maxLength={280}
            />

            <TouchableOpacity
              style={[styles.actionLine, (!mediaBase64 || uploading) && { opacity: 0.4 }]}
              onPress={handleUpload}
              activeOpacity={0.7}
              disabled={!mediaBase64 || uploading}
            >
              <Text style={[styles.actionText, { color: c.accent }]}>{'> UPLOAD_'}</Text>
            </TouchableOpacity>
          </>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: SPACING.md,
    paddingTop: 18,
    paddingBottom: 18,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  backBtn: { width: 40, paddingVertical: 4 },
  backBtnText: { fontSize: 28, lineHeight: 34 },
  headerTitleRow: { flex: 1, flexDirection: 'row', alignItems: 'center' },
  headerPrompt: { fontFamily: fonts.dmMono, fontSize: 12, letterSpacing: 1 },
  headerTitle: { fontFamily: fonts.dmMono, fontSize: 12, letterSpacing: 2, textTransform: 'uppercase' },
  headerSpacer: { width: 40 },

  body: { paddingHorizontal: SPACING.md, paddingTop: SPACING.md, gap: 16 },
  separator: { fontFamily: fonts.dmMono, fontSize: 11 },

  actionLine: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap' },
  actionText: { fontFamily: fonts.dmMono, fontSize: 13 },
  hint: { fontFamily: fonts.dmMono, fontSize: 11 },

  previewContainer: { width: '100%', aspectRatio: 1, borderRadius: 8, overflow: 'hidden', position: 'relative' },
  preview: { width: '100%', height: '100%' },
  videoOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.25)',
  },
  videoIcon: { fontSize: 32, color: '#fff' },

  captionInput: {
    fontFamily: fonts.dmMono,
    fontSize: 13,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 8,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    minHeight: 80,
    textAlignVertical: 'top',
  },

  statusRow: { flexDirection: 'row', alignItems: 'center' },
  statusText: { fontFamily: fonts.dmMono, fontSize: 13 },
});
