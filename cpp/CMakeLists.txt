cmake_minimum_required(VERSION 3.16)
project(thuelang VERSION 0.1.0 LANGUAGES CXX)

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_CXX_EXTENSIONS OFF)

find_package(PkgConfig REQUIRED)
find_package(Threads REQUIRED)

# Release binaries set this so the executable does not need libre2.so.
option(THUELANG_RE2_STATIC "Link the static RE2 archive and its private dependencies" OFF)
if(THUELANG_RE2_STATIC)
  pkg_check_modules(RE2 REQUIRED re2)
else()
  pkg_check_modules(RE2 REQUIRED IMPORTED_TARGET re2)
endif()

add_library(thuelang src/engine.cpp src/prefix.cpp)
add_library(thuelang::thuelang ALIAS thuelang)
target_include_directories(thuelang
  PUBLIC
    $<BUILD_INTERFACE:${CMAKE_CURRENT_SOURCE_DIR}/include>
    $<INSTALL_INTERFACE:include>
  PRIVATE
    ${CMAKE_CURRENT_SOURCE_DIR}/src
)
if(THUELANG_RE2_STATIC)
  target_include_directories(thuelang PUBLIC ${RE2_STATIC_INCLUDE_DIRS})
  target_link_libraries(thuelang PUBLIC ${RE2_STATIC_LDFLAGS} Threads::Threads)
else()
  target_link_libraries(thuelang PUBLIC PkgConfig::RE2 Threads::Threads)
endif()
target_compile_options(thuelang PRIVATE -Wall -Wextra -Wpedantic)

add_executable(thue-cli src/cli.cpp)
target_link_libraries(thue-cli PRIVATE thuelang)
set_target_properties(thue-cli PROPERTIES OUTPUT_NAME thue)
target_compile_options(thue-cli PRIVATE -Wall -Wextra -Wpedantic)

include(GNUInstallDirs)
install(TARGETS thuelang thue-cli
  ARCHIVE DESTINATION ${CMAKE_INSTALL_LIBDIR}
  LIBRARY DESTINATION ${CMAKE_INSTALL_LIBDIR}
  RUNTIME DESTINATION ${CMAKE_INSTALL_BINDIR}
)
install(DIRECTORY include/ DESTINATION ${CMAKE_INSTALL_INCLUDEDIR})
