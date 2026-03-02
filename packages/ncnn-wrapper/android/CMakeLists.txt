project(reactnativeai_ncnnwrapper)
cmake_minimum_required(VERSION 3.9.0)

set(PACKAGE_NAME reactnativeai_ncnnwrapper)
set(CMAKE_VERBOSE_MAKEFILE ON)
set(CMAKE_CXX_STANDARD 20)

# Define C++ library and add all sources
add_library(${PACKAGE_NAME} SHARED
        src/main/cpp/cpp-adapter.cpp
        ../cpp/NcnnWrapperModule.cpp
)

# Set up local includes
include_directories("src/main/cpp" "../cpp")

# Set up NCNN paths based on Android ABI
set(NCNN_ROOT "${CMAKE_CURRENT_SOURCE_DIR}/../vendor/ncnn-android-vulkan/${ANDROID_ABI}")
set(ncnn_DIR "${NCNN_ROOT}/lib/cmake/ncnn")
set(glslang_DIR "${NCNN_ROOT}/lib/cmake/glslang")

# Add NCNN include directory
include_directories("${NCNN_ROOT}/include")

# Find NCNN package using its CMake config
find_package(ncnn REQUIRED)

find_library(LOG_LIB log)

# Find React Native packages
find_package(ReactAndroid REQUIRED CONFIG)
find_package(fbjni REQUIRED CONFIG)

# Link all libraries together
target_link_libraries(
        ${PACKAGE_NAME}
        ${LOG_LIB}
        android # <-- Android core
        ReactAndroid::jsi
        ReactAndroid
        fbjni::fbjni
        # Link NCNN and its dependencies via CMake config
        ncnn
)
