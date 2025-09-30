package com.reactnativeai

import com.reactnativeai.NativeMLCEngineModule.Companion.MODEL_CONFIG_FILENAME
import com.reactnativeai.NativeMLCEngineModule.Companion.MODEL_URL_SUFFIX
import com.reactnativeai.NativeMLCEngineModule.Companion.PARAMS_CONFIG_FILENAME
import com.google.gson.Gson
import java.io.File
import java.io.FileOutputStream
import java.net.URL
import java.nio.channels.Channels
import java.util.UUID
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.withContext

class ModelState(private val modelConfig: ModelConfig, private val modelDir: File) {
  private var paramsConfig = ParamsConfig(emptyList())
  val progress = MutableStateFlow(0)
  val total = MutableStateFlow(1)
  val id: UUID = UUID.randomUUID()
  private val remainingTasks = emptySet<DownloadTask>().toMutableSet()
  private val downloadingTasks = emptySet<DownloadTask>().toMutableSet()
  private val maxDownloadTasks = 3
  private val gson = Gson()

  suspend fun initialize() {
    val paramsConfigFile = File(modelDir, PARAMS_CONFIG_FILENAME)
    if (!paramsConfigFile.exists()) {
      downloadParamsConfig()
    }

    loadParamsConfig()
    indexModel()
  }

  private fun loadParamsConfig() {
    val paramsConfigFile = File(modelDir, PARAMS_CONFIG_FILENAME)
    require(paramsConfigFile.exists())
    val jsonString = paramsConfigFile.readText()
    paramsConfig = gson.fromJson(jsonString, ParamsConfig::class.java)
  }

  private suspend fun downloadParamsConfig() {
    withContext(Dispatchers.IO) {
      val url = URL("${modelConfig.modelUrl}$MODEL_URL_SUFFIX$PARAMS_CONFIG_FILENAME")
      val tempId = UUID.randomUUID().toString()
      val tempFile = File(modelDir, tempId)
      url.openStream().use {
        Channels.newChannel(it).use { src ->
          FileOutputStream(tempFile).use { fileOutputStream ->
            fileOutputStream.channel.transferFrom(src, 0, Long.MAX_VALUE)
          }
        }
      }
      require(tempFile.exists())
      val paramsConfigFile = File(modelDir, PARAMS_CONFIG_FILENAME)
      tempFile.renameTo(paramsConfigFile)
      require(paramsConfigFile.exists())
    }
  }

  suspend fun download() {
    while (remainingTasks.isNotEmpty() && downloadingTasks.size < maxDownloadTasks) {
      val downloadTask = remainingTasks.first()
      remainingTasks.remove(downloadTask)
      handleNewDownload(downloadTask)
    }
  }

  private suspend fun handleNewDownload(downloadTask: DownloadTask) {
    require(!downloadingTasks.contains(downloadTask))
    downloadingTasks.add(downloadTask)

    withContext(Dispatchers.IO) {
      val tempId = UUID.randomUUID().toString()
      val tempFile = File(modelDir, tempId)

      downloadTask.url.openStream().use {
        Channels.newChannel(it).use { src ->
          FileOutputStream(tempFile).use { fileOutputStream ->
            fileOutputStream.channel.transferFrom(src, 0, Long.MAX_VALUE)
          }
        }
      }
      require(tempFile.exists())
      tempFile.renameTo(downloadTask.file)
      require(downloadTask.file.exists())

      handleFinishDownload(downloadTask)
    }
  }

  private fun handleFinishDownload(downloadTask: DownloadTask) {
    remainingTasks.remove(downloadTask)
    downloadingTasks.remove(downloadTask)
    ++progress.value
  }

  private fun clear() {
    val files = modelDir.listFiles { dir, name ->
      !(dir == modelDir && name == MODEL_CONFIG_FILENAME)
    }
    require(files != null)
    for (file in files) {
      file.deleteRecursively()
      require(!file.exists())
    }
    val modelConfigFile = File(modelDir, MODEL_CONFIG_FILENAME)
    require(modelConfigFile.exists())
    indexModel()
  }

  private fun indexModel() {
    progress.value = 0
    total.value = modelConfig.tokenizerFiles.size + paramsConfig.paramsRecords.size

    // Adding Tokenizer to download tasks
    for (tokenizerFilename in modelConfig.tokenizerFiles) {
      val file = File(modelDir, tokenizerFilename)
      if (file.exists()) {
        ++progress.value
      } else {
        remainingTasks.add(
          DownloadTask(
            URL("${modelConfig.modelUrl}$MODEL_URL_SUFFIX$tokenizerFilename"),
            file
          )
        )
      }
    }

    // Adding params to download tasks
    for (paramsRecord in paramsConfig.paramsRecords) {
      val file = File(modelDir, paramsRecord.dataPath)
      if (file.exists()) {
        ++progress.value
      } else {
        remainingTasks.add(
          DownloadTask(
            URL("${modelConfig.modelUrl}$MODEL_URL_SUFFIX${paramsRecord.dataPath}"),
            file
          )
        )
      }
    }
  }
}
