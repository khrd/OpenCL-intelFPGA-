# Directories
INC_DIRS := ./common/inc #using A10PL4 OpenCL BSP files
LIB_DIRS :=

# OpenCL compile and link flags.
AOCL_COMPILE_CONFIG := $(shell aocl compile-config )
AOCL_LINK_CONFIG := $(shell aocl link-config )

# Compilation flags
ifeq ($(DEBUG),1)
CXXFLAGS += -g
else
CXXFLAGS += -O2
endif

# Compiler
CXX := g++

# Files
INCS := $(wildcard )
SRCS := $(wildcard *.cpp ./common/src/AOCLUtils/*.cpp)
LIBS := rt pthread

main:	main.cpp
	$(CXX) $(CPPFLAGS) $(CXXFLAGS) -fPIC $(foreach D,$(INC_DIRS),-I$D) \
		$(AOCL_COMPILE_CONFIG) $(SRCS) $(AOCL_LINK_CONFIG) \
		$(foreach D,$(LIB_DIRS),-L$D) \
		$(foreach L,$(LIBS),-l$L) \
		-o ./bin/main
	
clean:
	rm ./bin/main


