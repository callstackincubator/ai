#!/bin/bash

find ios -type f \( -name "*.h" -o -name "*.cpp" -o -name "*.m" -o -name "*.mm" \) -print0 | while read -d $'\0' file; do
  echo "Formatting $file"
  clang-format -style=file:./ios/.clang-format -i "$file" $1
done 