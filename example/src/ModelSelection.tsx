import React, { useEffect, useState } from 'react';
import { View, StyleSheet, Text } from 'react-native';
import { type AiModelSettings, getModels } from 'react-native-ai';
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
            <View style={styles.dropdownButtonStyle}>
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
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 10,
  },
  dropdownButtonStyle: {
    width: 200,
    height: 50,
    backgroundColor: '#E9ECEF',
    borderRadius: 12,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 12,
  },
  dropdownButtonTxtStyle: {
    flex: 1,
    fontSize: 18,
    fontWeight: '500',
    color: '#151E26',
  },
  dropdownButtonArrowStyle: {
    fontSize: 28,
  },
  dropdownButtonIconStyle: {
    fontSize: 28,
    marginRight: 8,
  },
  dropdownMenuStyle: {
    backgroundColor: '#E9ECEF',
    borderRadius: 8,
  },
  dropdownItemStyle: {
    width: '100%',
    flexDirection: 'row',
    paddingHorizontal: 12,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 8,
  },
  dropdownItemTxtStyle: {
    flex: 1,
    fontSize: 18,
    fontWeight: '500',
    color: '#151E26',
  },
  dropdownItemIconStyle: {
    fontSize: 28,
    marginRight: 8,
  },
});
