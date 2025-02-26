package com.ai

import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import com.ai.AiModule.Companion.ModelConfigFilename
import com.ai.AiModule.Companion.ModelUrlSuffix
import com.ai.AiModule.Companion.ParamsConfigFilename
import com.google.gson.Gson
import java.io.File
import java.io.FileOutputStream
import java.net.URL
import java.nio.channels.Channels
import java.util.UUID
import kotlin.concurrent.thread

class ModelState(
  private val modelConfig: ModelConfig,
  private val modelDir: File
) {
  private var modelInitState = mutableStateOf(ModelInitState.Initializing)
  private var paramsConfig = ParamsConfig(emptyList())
  val progress = mutableIntStateOf(0)
  val total = mutableIntStateOf(1)
  val id: UUID = UUID.randomUUID()
  private val remainingTasks = emptySet<DownloadTask>().toMutableSet()
  private val downloadingTasks = emptySet<DownloadTask>().toMutableSet()
  private val maxDownloadTasks = 3
  private val gson = Gson()

  init {
    switchToInitializing()
  }

  private fun switchToInitializing() {
    val paramsConfigFile = File(modelDir, ParamsConfigFilename)
    if (paramsConfigFile.exists()) {
      loadParamsConfig()
      switchToIndexing()
    } else {
      downloadParamsConfig()
    }
  }

  private fun loadParamsConfig() {
    val paramsConfigFile = File(modelDir, ParamsConfigFilename)
    require(paramsConfigFile.exists())
    val jsonString = paramsConfigFile.readText()
    paramsConfig = gson.fromJson(jsonString, ParamsConfig::class.java)
  }

  private fun downloadParamsConfig() {
    thread(start = true) {
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

      loadParamsConfig()
      switchToIndexing()
    }
  }

  fun handleStart() {
    switchToDownloading()
  }

  private fun switchToDownloading() {
    modelInitState.value = ModelInitState.Downloading
    for (downloadTask in remainingTasks) {
      if (downloadingTasks.size < maxDownloadTasks) {
        handleNewDownload(downloadTask)
      } else {
        return
      }
    }
  }

  private fun handleNewDownload(downloadTask: DownloadTask) {
    require(modelInitState.value == ModelInitState.Downloading)
    require(!downloadingTasks.contains(downloadTask))
    downloadingTasks.add(downloadTask)
    thread(start = true) {
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
    ++progress.intValue
    require(
      modelInitState.value == ModelInitState.Downloading ||
        modelInitState.value == ModelInitState.Pausing ||
        modelInitState.value == ModelInitState.Clearing ||
        modelInitState.value == ModelInitState.Deleting
    )
    if (modelInitState.value == ModelInitState.Downloading) {
      if (remainingTasks.isEmpty()) {
        if (downloadingTasks.isEmpty()) {
          switchToFinished()
        }
      } else {
        handleNextDownload()
      }
    } else if (modelInitState.value == ModelInitState.Pausing) {
      if (downloadingTasks.isEmpty()) {
        switchToPaused()
      }
    } else if (modelInitState.value == ModelInitState.Clearing) {
      if (downloadingTasks.isEmpty()) {
        clear()
      }
    }
  }

  private fun switchToPaused() {
    modelInitState.value = ModelInitState.Paused
  }


  private fun switchToFinished() {
    modelInitState.value = ModelInitState.Finished
  }

  private fun handleNextDownload() {
    require(modelInitState.value == ModelInitState.Downloading)
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
    switchToIndexing()
  }

  private fun switchToIndexing() {
    modelInitState.value = ModelInitState.Indexing
    progress.intValue = 0
    total.intValue = modelConfig.tokenizerFiles.size + paramsConfig.paramsRecords.size
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
