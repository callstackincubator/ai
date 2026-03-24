#include <jni.h>
#include <fbjni/fbjni.h>

using namespace facebook;

JNIEXPORT jint JNICALL JNI_OnLoad(JavaVM *vm, void *)
{
  return facebook::jni::initialize(vm, []
                                   {
                                     // Initialization code for the pure C++ module
                                     // The actual module registration happens through the TurboModule system
                                   });
}
