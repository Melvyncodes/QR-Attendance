import { Ionicons } from '@expo/vector-icons';
import { useEffect, useMemo, useState } from 'react';
import {
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';

interface AutocompleteInputProps {
  label: string;
  value: string;
  onChangeText: (text: string) => void;
  placeholder?: string;
  /** All possible suggestions (hardcoded + dynamic merged). */
  suggestions: string[];
  /** When true, shows a yellow warning if value isn't in suggestions. */
  warnIfUnmatched?: boolean;
  /** Auto-capitalize behavior */
  autoCapitalize?: 'none' | 'sentences' | 'words' | 'characters';
  /** Optional helper text shown under the input */
  helperText?: string;
}

/**
 * AutocompleteInput
 * - Free typing allowed
 * - Live filterable dropdown (case-insensitive substring match)
 * - Warning indicator when value doesn't match any suggestion
 * - Tapping a suggestion fills the field and closes the dropdown
 */
export default function AutocompleteInput({
  label,
  value,
  onChangeText,
  placeholder,
  suggestions,
  warnIfUnmatched = true,
  autoCapitalize = 'words',
  helperText,
}: AutocompleteInputProps) {
  const [focused, setFocused] = useState(false);
  const [showDropdown, setShowDropdown] = useState(false);

  // Filter suggestions based on what user typed
  const filtered = useMemo(() => {
    const trimmed = value.trim().toLowerCase();
    if (!trimmed) return suggestions.slice(0, 8);
    return suggestions
      .filter(s => s.toLowerCase().includes(trimmed))
      .slice(0, 8);
  }, [value, suggestions]);

  // Check if current value matches any suggestion exactly (case-insensitive)
  const isMatched = useMemo(() => {
    if (!value.trim()) return true; // empty = no warning
    return suggestions.some(s => s.toLowerCase() === value.trim().toLowerCase());
  }, [value, suggestions]);

  const showWarning = warnIfUnmatched && value.trim().length > 0 && !isMatched;

  // Hide dropdown when value matches a suggestion exactly
  useEffect(() => {
    if (isMatched && value.trim().length > 0) {
      setShowDropdown(false);
    }
  }, [isMatched, value]);

  const handleSelect = (item: string) => {
    onChangeText(item);
    setShowDropdown(false);
  };

  return (
    <View style={s.container}>
      <Text style={s.label}>{label}</Text>
      <View style={[s.inputWrapper, focused && s.inputWrapperFocused, showWarning && s.inputWrapperWarning]}>
        <TextInput
          style={s.input}
          value={value}
          onChangeText={(t) => {
            onChangeText(t);
            setShowDropdown(true);
          }}
          onFocus={() => { setFocused(true); setShowDropdown(true); }}
          onBlur={() => {
            setFocused(false);
            // Delay closing so taps on suggestions register
            setTimeout(() => setShowDropdown(false), 200);
          }}
          placeholder={placeholder}
          placeholderTextColor="#999"
          autoCapitalize={autoCapitalize}
        />
        {showWarning && (
          <Ionicons name="warning-outline" size={18} color="#F39C12" style={{ marginRight: 10 }} />
        )}
      </View>

      {showWarning && (
        <Text style={s.warningText}>
          ⚠ Not in suggestions list. Are you sure this is correct?
        </Text>
      )}

      {helperText && !showWarning && (
        <Text style={s.helperText}>{helperText}</Text>
      )}

      {/* Dropdown */}
      {showDropdown && filtered.length > 0 && (
        <View style={s.dropdown}>
          {filtered.map((item, idx) => (
            <TouchableOpacity
              key={`${item}-${idx}`}
              style={[s.dropdownItem, idx < filtered.length - 1 && s.dropdownItemBorder]}
              onPress={() => handleSelect(item)}
              activeOpacity={0.6}
            >
              <Ionicons name="search-outline" size={14} color="#999" />
              <Text style={s.dropdownItemText}>{item}</Text>
            </TouchableOpacity>
          ))}
        </View>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  container: {
    position: 'relative',
    zIndex: 100,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: '#2C3E7A',
    marginBottom: 6,
    marginTop: 12,
  },
  inputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F5F6FA',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#E0E0E0',
  },
  inputWrapperFocused: {
    borderColor: '#2C3E7A',
  },
  inputWrapperWarning: {
    borderColor: '#F39C12',
    backgroundColor: '#FFFBF0',
  },
  input: {
    flex: 1,
    padding: 12,
    fontSize: 15,
    color: '#2D3436',
  },
  warningText: {
    fontSize: 11,
    color: '#F39C12',
    marginTop: 4,
    fontStyle: 'italic',
  },
  helperText: {
    fontSize: 11,
    color: '#999',
    marginTop: 4,
  },
  dropdown: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#E0E0E0',
    borderRadius: 8,
    marginTop: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 8,
    maxHeight: 240,
    overflow: 'hidden',
  },
  dropdownItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    gap: 10,
    backgroundColor: '#fff',
  },
  dropdownItemBorder: {
    borderBottomWidth: 1,
    borderBottomColor: '#F0F0F0',
  },
  dropdownItemText: {
    fontSize: 14,
    color: '#2D3436',
    flex: 1,
  },
});
