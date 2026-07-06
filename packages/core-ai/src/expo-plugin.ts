import {
  ConfigPlugin,
  createRunOncePlugin,
  IOSConfig,
  WarningAggregator,
  withDangerousMod,
} from 'expo/config-plugins'
import { existsSync, readFileSync, writeFileSync } from 'fs'

const pkg = require('../../package.json')

export type CoreAISwiftPackageProduct =
  | 'CoreAILM'
  | 'CoreAIDiffusion'
  | 'CoreAISegmentation'
  | 'CoreAIObjectDetection'

export type CoreAIExpoPluginOptions = {
  products?: CoreAISwiftPackageProduct[]
  targetName?: string
}

const CORE_AI_PACKAGE_URL = 'https://github.com/apple/coreai-models'
const CORE_AI_PACKAGE_NAME = 'coreai-models'
const DEFAULT_PRODUCTS: CoreAISwiftPackageProduct[] = [
  'CoreAILM',
  'CoreAIDiffusion',
  'CoreAISegmentation',
  'CoreAIObjectDetection',
]

const withCoreAISwiftPackage: ConfigPlugin<CoreAIExpoPluginOptions | void> = (
  config,
  options = {}
) => {
  return withDangerousMod(config, [
    'ios',
    (config) => {
      const projectPath = IOSConfig.Paths.getPBXProjectPath(
        config.modRequest.projectRoot
      )

      if (!existsSync(projectPath)) {
        WarningAggregator.addWarningIOS(
          'plugins',
          `Could not find project.pbxproj to link ${CORE_AI_PACKAGE_URL}. Add the Swift Package manually.`
        )
        return config
      }

      const contents = readFileSync(projectPath, 'utf8')
      const nextContents = addSwiftPackageProducts(contents, {
        products: options?.products ?? DEFAULT_PRODUCTS,
        targetName: options?.targetName ?? config.modRequest.projectName,
      })

      if (contents !== nextContents) {
        writeFileSync(projectPath, nextContents)
      }

      return config
    },
  ])
}

type AddSwiftPackageOptions = {
  products: CoreAISwiftPackageProduct[]
  targetName?: string
}

function addSwiftPackageProducts(
  contents: string,
  options: AddSwiftPackageOptions
) {
  const products = uniqueProducts(options.products)
  const projectId = findProjectId(contents)
  const target = findApplicationTarget(contents, options.targetName)
  const frameworksPhaseId = findFrameworksBuildPhaseId(target.block)

  if (!projectId || !target.id || !frameworksPhaseId) {
    WarningAggregator.addWarningIOS(
      'plugins',
      `Could not safely link ${CORE_AI_PACKAGE_URL}. Add the Swift Package products manually in Xcode.`
    )
    return contents
  }

  let nextContents = contents
  const packageId = stablePbxId('CoreAI Swift package')

  nextContents = ensureSectionEntry(
    nextContents,
    'XCRemoteSwiftPackageReference',
    `${packageId} /* XCRemoteSwiftPackageReference "${CORE_AI_PACKAGE_NAME}" */ = {
			isa = XCRemoteSwiftPackageReference;
			repositoryURL = "${CORE_AI_PACKAGE_URL}";
			requirement = {
				branch = main;
				kind = branch;
			};
		};`
  )

  nextContents = ensureListItem(
    nextContents,
    projectId,
    'packageReferences',
    `${packageId} /* XCRemoteSwiftPackageReference "${CORE_AI_PACKAGE_NAME}" */`
  )

  for (const product of products) {
    const productId = stablePbxId(`CoreAI product ${product}`)
    const buildFileId = stablePbxId(`CoreAI build file ${product}`)

    nextContents = ensureSectionEntry(
      nextContents,
      'XCSwiftPackageProductDependency',
      `${productId} /* ${product} */ = {
			isa = XCSwiftPackageProductDependency;
			package = ${packageId} /* XCRemoteSwiftPackageReference "${CORE_AI_PACKAGE_NAME}" */;
			productName = ${product};
		};`
    )

    nextContents = ensureSectionEntry(
      nextContents,
      'PBXBuildFile',
      `${buildFileId} /* ${product} in Frameworks */ = {isa = PBXBuildFile; productRef = ${productId} /* ${product} */; };`
    )

    nextContents = ensureListItem(
      nextContents,
      target.id,
      'packageProductDependencies',
      `${productId} /* ${product} */`
    )

    nextContents = ensureListItem(
      nextContents,
      frameworksPhaseId,
      'files',
      `${buildFileId} /* ${product} in Frameworks */`
    )
  }

  return nextContents
}

function uniqueProducts(products: CoreAISwiftPackageProduct[]) {
  return [...new Set(products)]
}

function findProjectId(contents: string) {
  const projectObject = contents.match(
    /([A-F0-9]{24}) \/\* Project object \*\/ = {\n\s+isa = PBXProject;/
  )
  if (projectObject) {
    return projectObject[1]
  }

  return contents.match(
    /([A-F0-9]{24}) \/\* .* \*\/ = {\n\s+isa = PBXProject;/
  )?.[1]
}

function findApplicationTarget(contents: string, targetName?: string) {
  const targetRegex =
    /([A-F0-9]{24}) \/\* ([^*]+) \*\/ = {\n\s+isa = PBXNativeTarget;[\s\S]*?\n\t\t};/g
  const targets = Array.from(contents.matchAll(targetRegex)).map((match) => ({
    id: match[1],
    name: match[2].trim(),
    block: match[0],
  }))

  const namedTarget = targetName
    ? targets.find((target) => target.name === targetName)
    : undefined

  return (
    namedTarget ??
    targets.find((target) =>
      target.block.includes(
        'productType = "com.apple.product-type.application"'
      )
    ) ??
    targets[0] ?? { id: undefined, block: '' }
  )
}

function findFrameworksBuildPhaseId(targetBlock: string) {
  return targetBlock.match(/([A-F0-9]{24}) \/\* Frameworks \*\//)?.[1]
}

function ensureSectionEntry(
  contents: string,
  sectionName: string,
  entry: string
) {
  const id = entry.slice(0, 24)

  if (contents.includes(id)) {
    return contents
  }

  const sectionStart = `/* Begin ${sectionName} section */`
  const sectionEnd = `/* End ${sectionName} section */`

  if (contents.includes(sectionStart)) {
    return contents.replace(sectionEnd, `\t\t${entry}\n${sectionEnd}`)
  }

  return contents.replace(
    '/* Begin XCBuildConfiguration section */',
    `${sectionStart}\n\t\t${entry}\n${sectionEnd}\n\n/* Begin XCBuildConfiguration section */`
  )
}

function ensureListItem(
  contents: string,
  objectId: string,
  propertyName: string,
  item: string
) {
  const objectRegex = new RegExp(
    `(${objectId} /\\* [^*]+ \\*/ = \\{[\\s\\S]*?\\n\\t\\t\\};)`
  )
  const objectMatch = contents.match(objectRegex)

  if (!objectMatch || objectMatch[1].includes(item)) {
    return contents
  }

  const objectBlock = objectMatch[1]
  const listRegex = new RegExp(
    `(\\n\\t\\t\\t${propertyName} = \\(\\n)([\\s\\S]*?)(\\t\\t\\t\\);)`
  )
  const listMatch = objectBlock.match(listRegex)
  const nextBlock = listMatch
    ? objectBlock.replace(listRegex, `$1$2\t\t\t\t${item},\n$3`)
    : objectBlock.replace(
        /\n\t\t};$/,
        `\n\t\t\t${propertyName} = (\n\t\t\t\t${item},\n\t\t\t);\n\t\t};`
      )

  return contents.replace(objectBlock, nextBlock)
}

function stablePbxId(value: string) {
  let hash = 0
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 31 + value.charCodeAt(index)) >>> 0
  }
  return hash.toString(16).toUpperCase().padStart(24, '0').slice(0, 24)
}

export { addSwiftPackageProducts }

export default createRunOncePlugin(
  withCoreAISwiftPackage,
  pkg.name,
  pkg.version
)
