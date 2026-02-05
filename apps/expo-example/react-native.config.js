module.exports = {
  dependencies: {
    'onnxruntime-react-native': {
      root: './node_modules/onnxruntime-react-native',
      platforms: {
        android: {
          sourceDir: './android',
          packageImportPath:
            'import ai.onnxruntime.reactnative.OnnxruntimePackage;',
          packageInstance: 'new OnnxruntimePackage()',
        },
      },
    },
  },
}
