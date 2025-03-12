package com.ai

import android.util.Log
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import com.ai.AiModule.Companion.ModelConfigFilename
import com.ai.AiModule.Companion.ModelUrlSuffix
import com.ai.AiModule.Companion.ParamsConfigFilename
import com.google.gson.Gson
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import java.io.File
import java.io.FileOutputStream
import java.net.URL
import java.nio.channels.Channels
import java.util.UUID

class ModelState(
  private val modelConfig: ModelConfig,
  private val modelDir: File
) {
  private var paramsConfig = ParamsConfig(emptyList())
  val progress = mutableIntStateOf(0)
  val total = mutableIntStateOf(1)
  val id: UUID = UUID.randomUUID()
  private val remainingTasks = emptySet<DownloadTask>().toMutableSet()
  private val downloadingTasks = emptySet<DownloadTask>().toMutableSet()
  private val maxDownloadTasks = 3
  private val gson = Gson()

  suspend fun initialize() {
    val paramsConfigFile = File(modelDir, ParamsConfigFilename)
    if (!paramsConfigFile.exists()) {
      downloadParamsConfig()
    }

    loadParamsConfig()
    indexModel()
  }

  private fun loadParamsConfig() {
    val paramsConfigFile = File(modelDir, ParamsConfigFilename)
    require(paramsConfigFile.exists())
    val jsonString = paramsConfigFile.readText()
    paramsConfig = gson.fromJson(jsonString, ParamsConfig::class.java)
  }

  private suspend fun downloadParamsConfig() {
    withContext(Dispatchers.IO) {
      val url = URL("${modelConfig.modelUrl}$ModelUrlSuffix$ParamsConfigFilename")
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
      val paramsConfigFile = File(modelDir, ParamsConfigFilename)
      tempFile.renameTo(paramsConfigFile)
      require(paramsConfigFile.exists())
    }
  }

  suspend fun download() {
    for (downloadTask in remainingTasks.toList()) {
      if (downloadingTasks.size < maxDownloadTasks) {
        handleNewDownload(downloadTask)
      } else {
        break
      }
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

  private suspend fun handleFinishDownload(downloadTask: DownloadTask) {
    remainingTasks.remove(downloadTask)
    downloadingTasks.remove(downloadTask)
    ++progress.intValue

      if (remainingTasks.isEmpty()) {
        if (downloadingTasks.isEmpty()) {
          return
        }
      } else {
        handleNextDownload()
      }
  }

  private suspend fun handleNextDownload() {
    for (downloadTask in remainingTasks) {
      if (!downloadingTasks.contains(downloadTask)) {
        handleNewDownload(downloadTask)
        break
      }
    }
  }

  private fun clear() {
    val files = modelDir.listFiles { dir, name ->
      !(dir == modelDir && name == ModelConfigFilename)
    }
    require(files != null)
    for (file in files) {
      file.deleteRecursively()
      require(!file.exists())
    }
    val modelConfigFile = File(modelDir, ModelConfigFilename)
    require(modelConfigFile.exists())
    indexModel()
  }

  private fun indexModel() {
    progress.intValue = 0
    total.intValue = modelConfig.tokenizerFiles.size + paramsConfig.paramsRecords.size

    // Adding Tokenizer to download tasks
    for (tokenizerFilename in modelConfig.tokenizerFiles) {
      val file = File(modelDir, tokenizerFilename)
      if (file.exists()) {
        ++progress.intValue
      } else {
        remainingTasks.add(
          DownloadTask(
            URL("${modelConfig.modelUrl}$ModelUrlSuffix${tokenizerFilename}"),
            file
          )
        )
      }
    }

    // Adding params to download tasks
    for (paramsRecord in paramsConfig.paramsRecords) {
      val file = File(modelDir, paramsRecord.dataPath)
      if (file.exists()) {
        ++progress.intValue
      } else {
        remainingTasks.add(
          DownloadTask(
            URL("${modelConfig.modelUrl}$ModelUrlSuffix${paramsRecord.dataPath}"),
            file
          )
        )
      }
    }
  }
}
