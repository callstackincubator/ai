#!/bin/bash

cd android && ktlint --reporter=checkstyle,output=build/ktlint-report.xml --relative --editorconfig=../.editorconfig 