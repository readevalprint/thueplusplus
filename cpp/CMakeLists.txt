cmake_minimum_required(VERSION 3.16)
project(thuepp VERSION 0.5.0 LANGUAGES CXX)

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_CXX_EXTENSIONS OFF)

find_package(PkgConfig REQUIRED)
pkg_check_modules(RE2 REQUIRED IMPORTED_TARGET re2)
find_package(Threads REQUIRED)

add_library(thuepp src/engine.cpp src/prefix.cpp)
add_library(thuepp::thuepp ALIAS thuepp)
target_include_directories(thuepp
  PUBLIC
    $<BUILD_INTERFACE:${CMAKE_CURRENT_SOURCE_DIR}/include>
    $<INSTALL_INTERFACE:include>
  PRIVATE
    ${CMAKE_CURRENT_SOURCE_DIR}/src
)
target_link_libraries(thuepp PUBLIC PkgConfig::RE2 Threads::Threads)
target_compile_options(thuepp PRIVATE -Wall -Wextra -Wpedantic)

add_executable(thuepp-cli src/cli.cpp)
target_link_libraries(thuepp-cli PRIVATE thuepp)
set_target_properties(thuepp-cli PROPERTIES OUTPUT_NAME thuepp)
target_compile_options(thuepp-cli PRIVATE -Wall -Wextra -Wpedantic)

include(GNUInstallDirs)
install(TARGETS thuepp thuepp-cli
  ARCHIVE DESTINATION ${CMAKE_INSTALL_LIBDIR}
  LIBRARY DESTINATION ${CMAKE_INSTALL_LIBDIR}
  RUNTIME DESTINATION ${CMAKE_INSTALL_BINDIR}
)
install(DIRECTORY include/ DESTINATION ${CMAKE_INSTALL_INCLUDEDIR})
