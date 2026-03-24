project(reactnativeai_ncnnwrapper)
cmake_minimum_required(VERSION 3.9.0)

set(CMAKE_VERBOSE_MAKEFILE ON)
set(CMAKE_CXX_STANDARD 20)

# RN AI NCNN Wrapper section - start
set(COMMON_CPP_DIR "${CMAKE_CURRENT_SOURCE_DIR}/../../../../cpp")
set(ANDROID_CPP_DIR "${CMAKE_CURRENT_SOURCE_DIR}")

file(GLOB_RECURSE COMMON_CPP_SOURCES CONFIGURE_DEPENDS
     "${COMMON_CPP_DIR}/**/*.cpp")
file(GLOB_RECURSE ANDROID_CPP_SOURCES CONFIGURE_DEPENDS
     "${ANDROID_CPP_DIR}/**/*.cpp")

add_library(${CMAKE_PROJECT_NAME} SHARED
    cpp-adapter.cpp
)

target_sources(${CMAKE_PROJECT_NAME} PRIVATE ${COMMON_CPP_SOURCES} ${ANDROID_CPP_SOURCES})

include_directories(${CMAKE_PROJECT_NAME} PUBLIC ${COMMON_CPP_DIR} ${ANDROID_CPP_DIR})

include_directories("${ANDROID_CPP_DIR}" "${COMMON_CPP_DIR}")
# RN AI NCNN Wrapper section - end

# React Native section - start
if(ReactAndroid_VERSION_MINOR GREATER_EQUAL 80)
    include(
    "${REACT_NATIVE_DIR}/ReactCommon/cmake-utils/react-native-flags.cmake")
    target_compile_reactnative_options(reanimated PUBLIC)
else()
    add_compile_options(
        -fexceptions
        -frtti
        -std=c++${CMAKE_CXX_STANDARD})
endif()

find_package(fbjni REQUIRED CONFIG)
find_package(ReactAndroid REQUIRED CONFIG)
# React Native section - end

# NCNN section - start
set(NCNN_ROOT "${CMAKE_CURRENT_SOURCE_DIR}/../../../../vendor/ncnn-android-vulkan/${ANDROID_ABI}")
set(ncnn_DIR "${NCNN_ROOT}/lib/cmake/ncnn")
set(glslang_DIR "${NCNN_ROOT}/lib/cmake/glslang")
message(STATUS "NCNN_ROOT: ${NCNN_ROOT} ${ncnn_DIR}")

include_directories("${NCNN_ROOT}/include")

find_package(ncnn REQUIRED)
# NCNN section - end

find_library(LOG_LIB log)

target_link_libraries(
    ${CMAKE_PROJECT_NAME}
    ReactAndroid::reactnative
    ReactAndroid::jsi
    fbjni::fbjni
    ${LOG_LIB}
    android
    ncnn
)
