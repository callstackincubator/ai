import React, { useEffect, useState } from 'react';
import { View, StyleSheet, Text } from 'react-native';
import { type AiModelSettings, getModels } from '../../../packages/mlc/src';
import SelectDropdown from 'react-native-select-dropdown';

type ModelSelectionProps = {
  onModelIdSelected: (modelSettings: AiModelSettings) => void;
};

export const ModelSelection = ({ onModelIdSelected }: ModelSelectionProps) => {
  const [availableModels, setAvailableModels] = useState<AiModelSettings[]>([]);

  useEffect(() => {
    const getAvailableModels = async () => {
      const models = await getModels();
      setAvailableModels(models);
    };

    getAvailableModels();
  }, []);

  return (
    <View style={styles.container}>
      <SelectDropdown
        data={availableModels}
        onSelect={onModelIdSelected}
        renderButton={(selectedItem) => {
          return (
            <View style={[styles.dropdownButtonStyle, styles.buttonStyle]}>
              <Text style={styles.dropdownButtonTxtStyle}>
                {(selectedItem && selectedItem.model_id) || 'Select model'}
              </Text>
            </View>
          );
        }}
        renderItem={(item, isSelected) => {
          return (
            <View
              style={{
                ...styles.dropdownItemStyle,
                ...(isSelected && { backgroundColor: '#D2D9DF' }),
              }}
            >
              <Text style={styles.dropdownItemTxtStyle}>{item.model_id}</Text>
            </View>
          );
        }}
        showsVerticalScrollIndicator={false}
        dropdownStyle={styles.dropdownMenuStyle}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    width: '100%',
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  buttonStyle: {
    width: '100%',
    height: 50,
    backgroundColor: '#F5F5F5',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#E8E8E8',
  },
  dropdownButtonStyle: {
    width: '100%',
    height: 50,
    backgroundColor: '#F5F5F5',
    borderRadius: 8,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 12,
  },
  dropdownButtonTxtStyle: {
    flex: 1,
    fontSize: 16,
    fontWeight: '500',
    color: '#151E26',
    textAlign: 'center',
  },
  dropdownMenuStyle: {
    backgroundColor: '#F5F5F5',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#E8E8E8',
  },
  dropdownItemStyle: {
    padding: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#E8E8E8',
  },
  dropdownItemTxtStyle: {
    fontSize: 16,
    color: '#151E26',
  },
});
