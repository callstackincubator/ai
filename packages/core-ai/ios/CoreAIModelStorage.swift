import Foundation

#if canImport(CoreAI)
import CoreAI
#endif

/// Downloads model folders from Hugging Face into app storage. Files land in
/// `<id>.partial`, which is moved into place once every file is complete, so a
/// model directory that exists is always whole. A download that stops midway
/// resumes where it left off: complete files are kept and partial files are
/// continued with a range request
enum ModelStorage {
  private static let lock = NSLock()
  nonisolated(unsafe) private static var activeDownloads: Set<String> = []

  static var modelsDirectory: URL {
    return FileManager.default.urls(for: .documentDirectory, in: .userDomainMask)[0]
      .appendingPathComponent("coreai-models", isDirectory: true)
  }

  static func isDownloaded(_ id: String) -> Bool {
    return !id.isEmpty && FileManager.default.fileExists(atPath: modelsDirectory.appendingPathComponent(id).path)
  }

  struct Progress {
    let bytesWritten: Int64
    let totalBytes: Int64
  }

  private struct HubFile: Decodable {
    let type: String
    let path: String
    let size: Int64
  }

  static func download(
    id: String,
    repo: String,
    folder: String,
    revision: String,
    onProgress: @escaping (Progress) -> Void
  ) async throws -> URL {
    guard !id.isEmpty, !id.contains("/"), !id.hasPrefix(".") else {
      throw CoreAIError.invalidInput("Model id must be a non-empty file name, got \"\(id)\".")
    }
    let destination = modelsDirectory.appendingPathComponent(id, isDirectory: true)
    if FileManager.default.fileExists(atPath: destination.path) {
      return destination
    }
    let started = lock.withLock { activeDownloads.insert(id).inserted }
    guard started else {
      throw CoreAIError.invalidInput("\(id) is already downloading.")
    }
    defer { _ = lock.withLock { activeDownloads.remove(id) } }

    let files = try await listFiles(repo: repo, folder: folder, revision: revision)
    let totalBytes = files.reduce(0) { $0 + $1.size }
    let partial = modelsDirectory.appendingPathComponent("\(id).partial", isDirectory: true)
    let reporter = ProgressReporter(totalBytes: totalBytes, onProgress: onProgress)

    var completedBytes: Int64 = 0
    for file in files {
      try Task.checkCancellation()
      let relativePath = folder.isEmpty ? file.path : String(file.path.dropFirst(folder.count + 1))
      let target = partial.appendingPathComponent(relativePath)
      try FileManager.default.createDirectory(at: target.deletingLastPathComponent(), withIntermediateDirectories: true)
      let encodedPath = file.path.addingPercentEncoding(withAllowedCharacters: .urlPathAllowed) ?? file.path
      let url = URL(string: "https://huggingface.co/\(repo)/resolve/\(revision)/\(encodedPath)?download=true")!
      let offset = completedBytes
      try await FileDownload.run(url: url, to: target, expectedSize: file.size) { written in
        reporter.report(offset + written)
      }
      completedBytes += file.size
    }
    reporter.report(totalBytes, force: true)

    try FileManager.default.moveItem(at: partial, to: destination)
    // Models are large and can be downloaded again, so they stay out of backups
    var resourceValues = URLResourceValues()
    resourceValues.isExcludedFromBackup = true
    var excluded = destination
    try? excluded.setResourceValues(resourceValues)
    return destination
  }

  private static func listFiles(repo: String, folder: String, revision: String) async throws -> [HubFile] {
    let path = folder.isEmpty ? "" : "/\(folder.addingPercentEncoding(withAllowedCharacters: .urlPathAllowed) ?? folder)"
    guard let url = URL(string: "https://huggingface.co/api/models/\(repo)/tree/\(revision)\(path)?recursive=true") else {
      throw CoreAIError.invalidInput("Invalid Hugging Face repo \"\(repo)\".")
    }
    let (data, response) = try await URLSession.shared.data(from: url)
    let status = (response as? HTTPURLResponse)?.statusCode ?? 0
    guard status == 200 else {
      throw CoreAIError.downloadFailed("Failed to list \(repo)/\(folder): HTTP \(status).")
    }
    let files = try JSONDecoder().decode([HubFile].self, from: data).filter { $0.type == "file" }
    guard !files.isEmpty else {
      throw CoreAIError.downloadFailed("\(repo)/\(folder) has no files.")
    }
    return files
  }
}

/// Sends progress at most every 100 ms
private final class ProgressReporter: @unchecked Sendable {
  private let totalBytes: Int64
  private let onProgress: (ModelStorage.Progress) -> Void
  private let lock = NSLock()
  private var lastReport = Date.distantPast

  init(totalBytes: Int64, onProgress: @escaping (ModelStorage.Progress) -> Void) {
    self.totalBytes = totalBytes
    self.onProgress = onProgress
  }

  func report(_ bytesWritten: Int64, force: Bool = false) {
    let now = Date()
    let shouldReport = lock.withLock {
      guard force || now.timeIntervalSince(lastReport) >= 0.1 else { return false }
      lastReport = now
      return true
    }
    if shouldReport {
      onProgress(ModelStorage.Progress(bytesWritten: bytesWritten, totalBytes: totalBytes))
    }
  }
}

/// Streams one file to disk, continuing a partial file with a range request
private final class FileDownload: NSObject, URLSessionDataDelegate, @unchecked Sendable {
  private let target: URL
  private let expectedSize: Int64
  private let onProgress: (Int64) -> Void
  private var handle: FileHandle?
  private var written: Int64
  private var continuation: CheckedContinuation<Void, Error>?

  private init(target: URL, expectedSize: Int64, written: Int64, onProgress: @escaping (Int64) -> Void) {
    self.target = target
    self.expectedSize = expectedSize
    self.written = written
    self.onProgress = onProgress
  }

  static func run(url: URL, to target: URL, expectedSize: Int64, onProgress: @escaping (Int64) -> Void) async throws {
    let existing = (try? FileManager.default.attributesOfItem(atPath: target.path)[.size] as? NSNumber)?.int64Value
    if let existing, existing == expectedSize {
      onProgress(existing)
      return
    }
    if existing == nil || existing! > expectedSize {
      FileManager.default.createFile(atPath: target.path, contents: nil)
    }
    let written = min(existing ?? 0, expectedSize)
    let download = FileDownload(target: target, expectedSize: expectedSize, written: written, onProgress: onProgress)

    var request = URLRequest(url: url)
    if written > 0 {
      request.setValue("bytes=\(written)-", forHTTPHeaderField: "Range")
    }
    let session = URLSession(configuration: .default, delegate: download, delegateQueue: nil)
    defer { session.finishTasksAndInvalidate() }
    let task = session.dataTask(with: request)
    try await withTaskCancellationHandler {
      try await withCheckedThrowingContinuation { (continuation: CheckedContinuation<Void, Error>) in
        download.continuation = continuation
        task.resume()
      }
    } onCancel: {
      task.cancel()
    }
  }

  func urlSession(
    _ session: URLSession,
    dataTask: URLSessionDataTask,
    didReceive response: URLResponse,
    completionHandler: @escaping (URLSession.ResponseDisposition) -> Void
  ) {
    let status = (response as? HTTPURLResponse)?.statusCode ?? 0
    do {
      let handle = try FileHandle(forWritingTo: target)
      if status == 206 {
        try handle.seekToEnd()
      } else if status == 200 {
        // The server sent the whole file, so it starts over
        try handle.truncate(atOffset: 0)
        written = 0
      } else {
        try? handle.close()
        finish(CoreAIError.downloadFailed("Failed to download \(target.lastPathComponent): HTTP \(status)."))
        completionHandler(.cancel)
        return
      }
      self.handle = handle
      completionHandler(.allow)
    } catch {
      finish(error)
      completionHandler(.cancel)
    }
  }

  func urlSession(_ session: URLSession, dataTask: URLSessionDataTask, didReceive data: Data) {
    do {
      try handle?.write(contentsOf: data)
      written += Int64(data.count)
      onProgress(written)
    } catch {
      finish(error)
      dataTask.cancel()
    }
  }

  func urlSession(_ session: URLSession, task: URLSessionTask, didCompleteWithError error: Error?) {
    try? handle?.close()
    handle = nil
    if let error {
      finish((error as? URLError)?.code == .cancelled ? CancellationError() : error)
    } else if written != expectedSize {
      finish(CoreAIError.downloadFailed("\(target.lastPathComponent) has \(written) of \(expectedSize) bytes."))
    } else {
      finish(nil)
    }
  }

  private func finish(_ error: Error?) {
    guard let continuation else { return }
    self.continuation = nil
    if let error {
      continuation.resume(throwing: error)
    } else {
      continuation.resume()
    }
  }
}

#if canImport(CoreAI)
/// Specializes the .aimodel assets of a model ahead of time, with the options
/// the loader of its task uses, so loading it later finds them in the default
/// AIModelCache. Bookmarks of the cache entries persist across launches in
/// Application Support
@available(iOS 27, macOS 27, *)
enum Specialization {
  private static let lock = NSLock()

  static func specialize(at url: URL, task: String?, options: [String: Any]) async throws -> [[String: Any]] {
    let policy: AIModelCache.Policy
    switch options["persistence"] as? String {
    case nil, "default":
      policy = .default
    case "persistent":
      policy = .persistent
    case let value?:
      throw CoreAIError.invalidInput("persistence must be default or persistent, got \(value).")
    }

    var results: [[String: Any]] = []
    for asset in try assetURLs(at: url) {
      try Task.checkCancellation()
      let specialization = try specializationOptions(for: asset, task: task, options: options)
      let key = bookmarkKey(asset, specialization)
      let start = Date()
      var cached = true
      let model: AIModel
      if let bookmark = bookmarks()[key], let restored = try? AIModel(resolvingBookmark: bookmark) {
        model = restored
      } else if let found = try? AIModelCache.default.model(for: asset, options: specialization) {
        model = found
      } else {
        cached = false
        model = try await AIModel.specialize(contentsOf: asset, options: specialization, cachePolicy: policy)
      }
      updateBookmarks { $0[key] = model.bookmarkData }
      results.append([
        "name": asset.lastPathComponent,
        "computeUnits": describe(specialization),
        "cached": cached,
        "durationMs": Int(Date().timeIntervalSince(start) * 1000)
      ])
    }
    return results
  }

  /// Deletes the cache entries of every asset of a model. Entries a loaded
  /// model still uses can't be deleted, so unload it first
  static func clearCache(at url: URL) throws {
    let prefix = bookmarkPrefix(url)
    var deleted: [String] = []
    for (key, bookmark) in bookmarks() where key.hasPrefix("\(prefix)/") || key.hasPrefix("\(prefix)|") {
      try? AIModelCache.deleteEntry(referencedBy: bookmark)
      deleted.append(key)
    }
    updateBookmarks { bookmarks in
      deleted.forEach { bookmarks.removeValue(forKey: $0) }
    }
    if FileManager.default.fileExists(atPath: url.path) {
      for asset in try assetURLs(at: url) {
        try AIModelCache.default.deleteEntries(for: asset)
      }
    }
  }

  /// The model itself when it is an asset, or the assets in its directory
  static func assetURLs(at url: URL) throws -> [URL] {
    if isAsset(url) {
      return [url]
    }
    let assets = try FileManager.default.contentsOfDirectory(at: url, includingPropertiesForKeys: nil)
      .filter(isAsset)
      .sorted { $0.path < $1.path }
    guard !assets.isEmpty else {
      throw CoreAIError.invalidInput("\(url.lastPathComponent) has no .aimodel assets.")
    }
    return assets
  }

  private static func isAsset(_ url: URL) -> Bool {
    return ["aimodel", "aimodelc"].contains(url.pathExtension) || AIModelAsset.isValid(at: url)
  }

  /// The options the coreai-models loader of each task specializes with.
  /// Raw models and the tasks run on them take options.computeUnits
  static func specializationOptions(for asset: URL, task: String?, options: [String: Any]) throws -> SpecializationOptions {
    switch task {
    case "diffusion", "video-diffusion":
      return SpecializationOptions(preferredComputeUnitKind: .gpu)
    case "asr", "object-detection":
      return .default
    case "language", "segmentation", "video-segmentation":
      return structureOptions(for: asset)
    default:
      return try RawModel.specializationOptions(options)
    }
  }

  /// As coreai-models' PreparedModel picks them from the function names
  private static func structureOptions(for asset: URL) -> SpecializationOptions {
    let names = Set((try? AIModelAsset(contentsOf: asset).summary(includingStatistics: false))?.functions.map(\.name) ?? [])
    if names.contains("load_embeddings") && names.contains(where: { $0.hasPrefix("extend") }) {
      return SpecializationOptions(preferredComputeUnitKind: .neuralEngine)
    }
    if names.contains("tracker_step") {
      return SpecializationOptions(preferredComputeUnitKind: .gpu)
    }
    if names.isSuperset(of: ["image_encode", "text_encode", "detect"]) {
      return SpecializationOptions(preferredComputeUnitKind: .neuralEngine)
    }
    var options = SpecializationOptions(preferredComputeUnitKind: .gpu)
    options.expectFrequentReshapes = true
    return options
  }

  private static func describe(_ options: SpecializationOptions) -> String {
    switch options.preferredComputeUnitKind {
    case .cpu?:
      return "cpu"
    case .gpu?:
      return "gpu"
    case .neuralEngine?:
      return "neural-engine"
    case nil:
      return options.allowedComputeUnitKinds == [.cpu] ? "cpu" : "default"
    }
  }

  // MARK: - Bookmarks

  private static var bookmarksURL: URL {
    return FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0]
      .appendingPathComponent("ReactNativeAICoreAI", isDirectory: true)
      .appendingPathComponent("specializations.json")
  }

  // Keys hold the path from the home directory, which moves between installs
  private static func bookmarkPrefix(_ url: URL) -> String {
    let home = NSHomeDirectory()
    let path = url.standardizedFileURL.path
    return path.hasPrefix(home) ? String(path.dropFirst(home.count)) : path
  }

  private static func bookmarkKey(_ asset: URL, _ options: SpecializationOptions) -> String {
    return "\(bookmarkPrefix(asset))|\(describe(options))|\(options.expectFrequentReshapes)"
  }

  private static func bookmarks() -> [String: Data] {
    return lock.withLock { readBookmarks() }
  }

  private static func readBookmarks() -> [String: Data] {
    guard let data = try? Data(contentsOf: bookmarksURL) else { return [:] }
    return (try? JSONDecoder().decode([String: Data].self, from: data)) ?? [:]
  }

  private static func updateBookmarks(_ update: (inout [String: Data]) -> Void) {
    lock.withLock {
      var bookmarks = readBookmarks()
      update(&bookmarks)
      try? FileManager.default.createDirectory(at: bookmarksURL.deletingLastPathComponent(), withIntermediateDirectories: true)
      try? JSONEncoder().encode(bookmarks).write(to: bookmarksURL, options: .atomic)
    }
  }
}
#endif
